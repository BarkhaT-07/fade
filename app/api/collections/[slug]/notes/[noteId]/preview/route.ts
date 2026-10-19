import { prisma } from "@/lib/db";
import { decryptText } from "@/lib/crypto";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { authCollection, authErrorResponse } from "@/lib/collections";
import { endNote } from "@/lib/notes";

// Lets the owner read a note WITHOUT using up one of its views.
export async function POST(
  req: Request,
  { params }: { params: { slug: string; noteId: string } }
) {
  const limit = rateLimit(`manage:${clientIp(req)}`, 60, 10 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many tries. Try again later." },
      { status: 429 }
    );
  }

  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const auth = await authCollection(params.slug, String(body.password ?? ""));
  if (auth.status !== "ok") return authErrorResponse(auth);
  if (auth.role !== "owner") {
    return Response.json({ error: "Only the owner can view notes this way." }, { status: 403 });
  }

  const note = await prisma.note.findFirst({
    where: { id: params.noteId, collectionId: auth.collection.id },
  });
  const gone = () =>
    Response.json({ error: "This note is gone." }, { status: 404 });
  if (!note || note.endedAt) return gone();
  if (note.expiresAt.getTime() <= Date.now()) {
    await endNote(note, "expired");
    return gone();
  }

  return Response.json({
    text: decryptText(note.contentEncrypted),
    label: note.labelEncrypted ? decryptText(note.labelEncrypted) : "",
    viewLimit: note.viewLimit,
    viewCount: note.viewCount,
  });
}
