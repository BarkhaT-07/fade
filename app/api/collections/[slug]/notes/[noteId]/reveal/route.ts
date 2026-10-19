import { prisma } from "@/lib/db";
import { decryptText } from "@/lib/crypto";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { authCollection, authErrorResponse } from "@/lib/collections";
import { consumeView, endNote } from "@/lib/notes";

// Reveals one note of a collection. Needs the viewer password.
export async function POST(
  req: Request,
  { params }: { params: { slug: string; noteId: string } }
) {
  const limit = rateLimit(`reveal:${clientIp(req)}`, 30, 10 * 60 * 1000);
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
  if (auth.role !== "viewer") {
    return Response.json(
      { error: "Use the viewer password to open notes." },
      { status: 403 }
    );
  }

  const note = await prisma.note.findFirst({
    where: { id: params.noteId, collectionId: auth.collection.id },
  });
  if (!note) {
    return Response.json({ error: "This note is gone." }, { status: 404 });
  }

  const taken = await consumeView(note.id);
  if (!taken) {
    if (!note.endedAt) await endNote(note, "expired");
    return Response.json({ error: "This note is gone." }, { status: 404 });
  }

  const text = decryptText(taken.note.contentEncrypted);
  if (taken.last) await endNote(taken.note, "viewed");

  return Response.json({ text, viewsLeft: taken.note.viewLimit - taken.note.viewCount - 1 });
}
