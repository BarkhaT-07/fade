import { prisma } from "@/lib/db";
import { decryptText } from "@/lib/crypto";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { authCollection, authErrorResponse } from "@/lib/collections";
import { ENDED_KEEP_MS, sweep } from "@/lib/notes";

// Unlocks a collection and lists its notes (never their content).
export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const limit = rateLimit(`open:${clientIp(req)}`, 60, 10 * 60 * 1000);
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

  await sweep(auth.collection.id);

  const notes = await prisma.note.findMany({
    where: { collectionId: auth.collection.id },
    orderBy: { createdAt: "desc" },
  });
  if (notes.length === 0) {
    return authErrorResponse({ status: "missing" });
  }

  return Response.json({
    role: auth.role,
    notes: notes.map((n) => ({
      id: n.id,
      label: n.labelEncrypted ? decryptText(n.labelEncrypted) : "Untitled",
      status: n.endedAt ? (n.endReason === "viewed" ? "viewed" : "expired") : "active",
      viewsLeft: n.endedAt ? 0 : n.viewLimit - n.viewCount,
      viewLimit: n.viewLimit,
      expiresAt: n.expiresAt.toISOString(),
      removeAt: n.endedAt ? new Date(n.endedAt.getTime() + ENDED_KEEP_MS).toISOString() : null,
    })),
  });
}
