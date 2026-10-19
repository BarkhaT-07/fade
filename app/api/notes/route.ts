import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { encryptText } from "@/lib/crypto";
import { generateNoteId } from "@/lib/id";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { parseNoteFields, validatePassword } from "@/lib/validate";

// Creates a standalone note: quick (no password) or password protected.
export async function POST(req: Request) {
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

  const parsed = parseNoteFields(body, { needLabel: false });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { text, viewLimit, hours } = parsed.value;

  const password = body.password ? String(body.password) : "";
  if (password) {
    const pwError = validatePassword(password);
    if (pwError) return Response.json({ error: pwError }, { status: 400 });
  }

  const id = generateNoteId();
  await prisma.note.create({
    data: {
      id,
      contentEncrypted: encryptText(text),
      viewLimit,
      passwordHash: password ? await bcrypt.hash(password, 10) : null,
      expiresAt: new Date(Date.now() + hours * 3600 * 1000),
    },
  });

  return Response.json({ id }, { status: 201 });
}
