import { prisma } from "@/lib/db";
import { encryptText } from "@/lib/crypto";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { authCollection, authErrorResponse } from "@/lib/collections";
import { endNote } from "@/lib/notes";
import { parseNoteFields } from "@/lib/validate";

const limited = () =>
  Response.json(
    { error: "Too many tries. Try again later." },
    { status: 429 }
  );

// Deletes a note from a collection right away. Needs the owner password.
export async function DELETE(
  req: Request,
  { params }: { params: { slug: string; noteId: string } }
) {
  if (!rateLimit(`manage:${clientIp(req)}`, 60, 10 * 60 * 1000).allowed) return limited();

  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const auth = await authCollection(params.slug, String(body.password ?? ""));
  if (auth.status !== "ok") return authErrorResponse(auth);
  if (auth.role !== "owner") {
    return Response.json({ error: "Only the owner can delete notes." }, { status: 403 });
  }

  await prisma.note.deleteMany({
    where: { id: params.noteId, collectionId: auth.collection.id },
  });
  return Response.json({ ok: true });
}

// Edits an active note: label, text, view limit, and optionally the expiry.
// Views already used are kept. Needs the owner password.
export async function PATCH(
  req: Request,
  { params }: { params: { slug: string; noteId: string } }
) {
  if (!rateLimit(`manage:${clientIp(req)}`, 60, 10 * 60 * 1000).allowed) return limited();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Something went wrong." }, { status: 400 });
  }

  const auth = await authCollection(params.slug, String(body.password ?? ""));
  if (auth.status !== "ok") return authErrorResponse(auth);
  if (auth.role !== "owner") {
    return Response.json({ error: "Only the owner can edit notes." }, { status: 403 });
  }

  const keepExpiry = body.keepExpiry === true;
  const parsed = parseNoteFields(
    { ...body, hours: keepExpiry ? 24 : body.hours },
    { needLabel: true }
  );
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { text, label, viewLimit, hours } = parsed.value;

  const gone = () =>
    Response.json({ error: "This note is gone." }, { status: 404 });

  const note = await prisma.note.findFirst({
    where: { id: params.noteId, collectionId: auth.collection.id },
  });
  if (!note || note.endedAt) return gone();
  if (note.expiresAt.getTime() <= Date.now()) {
    await endNote(note, "expired");
    return gone();
  }

  if (viewLimit <= note.viewCount) {
    return Response.json(
      {
        error: `Already opened ${note.viewCount} time(s). Set a higher limit.`,
      },
      { status: 400 }
    );
  }

  // The viewCount condition keeps this safe if a reader takes a view meanwhile.
  const res = await prisma.note.updateMany({
    where: {
      id: note.id,
      collectionId: auth.collection.id,
      endedAt: null,
      viewCount: { lt: viewLimit },
    },
    data: {
      contentEncrypted: encryptText(text),
      labelEncrypted: encryptText(label),
      viewLimit,
      ...(keepExpiry ? {} : { expiresAt: new Date(Date.now() + hours * 3600 * 1000) }),
    },
  });
  if (res.count === 0) return gone();

  return Response.json({ ok: true });
}
