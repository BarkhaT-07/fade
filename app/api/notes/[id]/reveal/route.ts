import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { decryptText } from "@/lib/crypto";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { MAX_FAILED_ATTEMPTS, consumeView, endNote } from "@/lib/notes";

const NOT_FOUND = () =>
  Response.json(
    { error: "This note doesn't exist anymore." },
    { status: 404 }
  );

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

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
  const password = body.password ? String(body.password) : "";

  const note = await prisma.note.findFirst({ where: { id, collectionId: null } });
  if (!note || note.endedAt) return NOT_FOUND();

  if (note.expiresAt.getTime() <= Date.now() || note.viewCount >= note.viewLimit) {
    await endNote(note, "expired");
    return NOT_FOUND();
  }

  if (note.passwordHash) {
    if (!password) {
      return Response.json({ error: "Enter the password." }, { status: 401 });
    }

    const correct = await bcrypt.compare(password, note.passwordHash);
    if (!correct) {
      // Atomic increment, so parallel guesses cannot dodge the counter.
      const updated = await prisma.note
        .update({ where: { id }, data: { failedAttempts: { increment: 1 } } })
        .catch(() => null);
      if (!updated) return NOT_FOUND();

      if (updated.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        await endNote(updated, "viewed");
        return NOT_FOUND();
      }
      return Response.json(
        {
          error: "Wrong password.",
          remainingAttempts: MAX_FAILED_ATTEMPTS - updated.failedAttempts,
        },
        { status: 401 }
      );
    }
  }

  // Atomic: when requests race for the last view, only one wins.
  const taken = await consumeView(id);
  if (!taken) return NOT_FOUND();

  const text = decryptText(taken.note.contentEncrypted);
  if (taken.last) await endNote(taken.note, "viewed");

  return Response.json({ text, viewsLeft: taken.note.viewLimit - taken.note.viewCount - 1 });
}
