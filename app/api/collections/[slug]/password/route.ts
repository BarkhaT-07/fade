import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { authCollection, authErrorResponse } from "@/lib/collections";
import { validatePassword } from "@/lib/validate";

// Changes the viewer or owner password. Needs the current owner password.
export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } }
) {
  if (!rateLimit(`manage:${clientIp(req)}`, 60, 10 * 60 * 1000).allowed) {
    return Response.json({ error: "Too many tries. Try again later." }, { status: 429 });
  }

  let body: { password?: unknown; which?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Something went wrong." }, { status: 400 });
  }

  const auth = await authCollection(params.slug, String(body.password ?? ""));
  if (auth.status !== "ok") return authErrorResponse(auth);
  if (auth.role !== "owner") {
    return Response.json({ error: "Only the owner can change passwords." }, { status: 403 });
  }

  const which = body.which === "owner" ? "owner" : body.which === "viewer" ? "viewer" : null;
  if (!which) return Response.json({ error: "Something went wrong." }, { status: 400 });

  const newPassword = String(body.newPassword ?? "");
  const pwError = validatePassword(newPassword, "New password");
  if (pwError) return Response.json({ error: pwError }, { status: 400 });

  // The two passwords must always stay different.
  const otherHash = which === "viewer" ? auth.collection.ownerHash : auth.collection.viewHash;
  if (await bcrypt.compare(newPassword, otherHash)) {
    return Response.json({ error: "Use two different passwords." }, { status: 400 });
  }

  await prisma.collection.update({
    where: { id: auth.collection.id },
    data:
      which === "viewer"
        ? { viewHash: await bcrypt.hash(newPassword, 10) }
        : { ownerHash: await bcrypt.hash(newPassword, 10) },
  });

  return Response.json({ ok: true });
}
