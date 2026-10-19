import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { encryptText } from "@/lib/crypto";
import { generateNoteId } from "@/lib/id";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import {
  normalizeSlug,
  parseNoteFields,
  validatePassword,
  validateSlug,
} from "@/lib/validate";

// Creates a custom link (collection) together with its first note.
export async function POST(req: Request) {
  const limit = rateLimit(`create:${clientIp(req)}`, 20, 10 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many tries. Try again later." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Something went wrong." }, { status: 400 });
  }

  const slug = normalizeSlug(body.slug);
  const viewPassword = String(body.viewPassword ?? "");
  const ownerPassword = String(body.ownerPassword ?? "");

  const slugError = validateSlug(slug);
  if (slugError) return Response.json({ error: slugError }, { status: 400 });

  const viewError = validatePassword(viewPassword, "Viewer password");
  if (viewError) return Response.json({ error: viewError }, { status: 400 });
  const ownerError = validatePassword(ownerPassword, "Owner password");
  if (ownerError) return Response.json({ error: ownerError }, { status: 400 });
  if (viewPassword === ownerPassword) {
    return Response.json(
      { error: "Use two different passwords." },
      { status: 400 }
    );
  }

  const parsed = parseNoteFields(body, { needLabel: true });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { text, label, viewLimit, hours } = parsed.value;

  if (await prisma.collection.findUnique({ where: { slug } })) {
    return Response.json({ error: "That link name is taken." }, { status: 409 });
  }

  try {
    await prisma.collection.create({
      data: {
        id: generateNoteId(),
        slug,
        viewHash: await bcrypt.hash(viewPassword, 10),
        ownerHash: await bcrypt.hash(ownerPassword, 10),
        notes: {
          create: {
            id: generateNoteId(),
            contentEncrypted: encryptText(text),
            labelEncrypted: encryptText(label),
            viewLimit,
            expiresAt: new Date(Date.now() + hours * 3600 * 1000),
          },
        },
      },
    });
  } catch {
    // Most likely someone took the same slug a moment ago.
    return Response.json({ error: "That link name is taken." }, { status: 409 });
  }

  return Response.json({ slug }, { status: 201 });
}
