import bcrypt from "bcryptjs";
import type { Collection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COLLECTION_LOCK_MS, MAX_FAILED_ATTEMPTS } from "@/lib/notes";

export type Role = "viewer" | "owner";

export type AuthResult =
  | { status: "ok"; collection: Collection; role: Role }
  | { status: "missing" }
  | { status: "locked"; minutes: number }
  | { status: "bad"; remaining: number };

/**
 * Checks a password against a collection. The viewer password lets someone
 * read notes, the owner password lets someone add and delete notes.
 * Too many wrong tries lock the collection for 15 minutes (it is not destroyed,
 * otherwise anyone could wipe a collection by guessing).
 */
export async function authCollection(
  slug: string,
  password: string
): Promise<AuthResult> {
  const collection = await prisma.collection.findUnique({ where: { slug } });
  if (!collection) return { status: "missing" };

  const now = Date.now();
  if (collection.lockedUntil && collection.lockedUntil.getTime() > now) {
    return {
      status: "locked",
      minutes: Math.max(1, Math.ceil((collection.lockedUntil.getTime() - now) / 60000)),
    };
  }

  let role: Role | null = null;
  if (password) {
    if (await bcrypt.compare(password, collection.viewHash)) role = "viewer";
    else if (await bcrypt.compare(password, collection.ownerHash)) role = "owner";
  }

  if (role) {
    if (collection.failedAttempts > 0 || collection.lockedUntil) {
      await prisma.collection
        .update({ where: { id: collection.id }, data: { failedAttempts: 0, lockedUntil: null } })
        .catch(() => {});
    }
    return { status: "ok", collection, role };
  }

  // Atomic increment so parallel guesses cannot dodge the counter.
  const updated = await prisma.collection
    .update({
      where: { id: collection.id },
      data: { failedAttempts: { increment: 1 } },
    })
    .catch(() => null);
  if (!updated) return { status: "missing" };

  if (updated.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.collection.update({
      where: { id: collection.id },
      data: { failedAttempts: 0, lockedUntil: new Date(now + COLLECTION_LOCK_MS) },
    });
    return { status: "locked", minutes: Math.ceil(COLLECTION_LOCK_MS / 60000) };
  }
  return { status: "bad", remaining: MAX_FAILED_ATTEMPTS - updated.failedAttempts };
}

export function authErrorResponse(auth: Exclude<AuthResult, { status: "ok" }>) {
  if (auth.status === "missing") {
    return Response.json(
      { error: "This link doesn't exist anymore." },
      { status: 404 }
    );
  }
  if (auth.status === "locked") {
    return Response.json(
      { error: `Too many wrong tries. Try again in ${auth.minutes} minute(s).` },
      { status: 429 }
    );
  }
  return Response.json(
    { error: "Wrong password.", remainingAttempts: auth.remaining },
    { status: 401 }
  );
}
