import { prisma } from "@/lib/db";
import { encryptText } from "@/lib/crypto";
import { generateNoteId } from "@/lib/id";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { authCollection, authErrorResponse } from "@/lib/collections";
import { parseNoteFields } from "@/lib/validate";

const MAX_NOTES_PER_COLLECTION = 20;

// Adds a note to a collection. Needs the owner password.
export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const limit = rateLimit(`create:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many notes. Try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Something went wrong." }, { status: 400 });
  }

  const auth = await authCollection(params.slug, String(body.password ?? ""));
  if (auth.status !== "ok") return authErrorResponse(auth);
  if (auth.role !== "owner") {
    return Response.json({ error: "Only the owner can add notes." }, { status: 403 });
  }

  const parsed = parseNoteFields(body, { needLabel: true });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { text, label, viewLimit, hours } = parsed.value;

  const count = await prisma.note.count({ where: { collectionId: auth.collection.id } });
  if (count >= MAX_NOTES_PER_COLLECTION) {
    return Response.json(
      { error: `A link can have up to ${MAX_NOTES_PER_COLLECTION} notes.` },
      { status: 400 }
    );
  }

  await prisma.note.create({
    data: {
      id: generateNoteId(),
      contentEncrypted: encryptText(text),
      labelEncrypted: encryptText(label),
      viewLimit,
      expiresAt: new Date(Date.now() + hours * 3600 * 1000),
      collectionId: auth.collection.id,
    },
  });

  return Response.json({ ok: true }, { status: 201 });
}
