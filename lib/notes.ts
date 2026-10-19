import { prisma } from "@/lib/db";
import type { Note } from "@prisma/client";

export const MAX_FAILED_ATTEMPTS = 5;
export const MIN_EXPIRY_HOURS = 24;
export const MAX_EXPIRY_HOURS = 72;
export const MAX_NOTE_LENGTH = 5000;
export const MIN_VIEWS = 1;
export const MAX_VIEWS = 10;
export const MAX_LABEL_LENGTH = 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt only uses the first 72 bytes
export const ENDED_KEEP_MS = 3 * 24 * 3600 * 1000; // ended notes vanish after 3 days
export const COLLECTION_LOCK_MS = 15 * 60 * 1000;

export type NoteScreen = "not-found" | "confirm" | "password" | "plain";

export type NoteInfo = { screen: NoteScreen; viewsLeft: number };

/** What the recipient sees before revealing a standalone note. */
export async function getNoteInfo(id: string): Promise<NoteInfo> {
  const note = await prisma.note.findFirst({ where: { id, collectionId: null } });
  if (!note || note.endedAt) return { screen: "not-found", viewsLeft: 0 };

  if (note.expiresAt.getTime() <= Date.now()) {
    await prisma.note.delete({ where: { id } }).catch(() => {});
    return { screen: "not-found", viewsLeft: 0 };
  }

  const viewsLeft = note.viewLimit - note.viewCount;
  if (viewsLeft <= 0) return { screen: "not-found", viewsLeft: 0 };
  if (note.passwordHash) return { screen: "password", viewsLeft };
  if (viewsLeft === 1) return { screen: "confirm", viewsLeft };
  return { screen: "plain", viewsLeft };
}

/**
 * Takes one view of a note. Uses compare-and-swap on viewCount, so when
 * several requests race for the last view only one of them wins.
 * Returns the note as it was before the view, or null if nothing was left.
 */
export async function consumeView(
  id: string
): Promise<{ note: Note; last: boolean } | null> {
  for (let attempt = 0; attempt < MAX_VIEWS + 2; attempt++) {
    const note = await prisma.note.findUnique({ where: { id } });
    if (
      !note ||
      note.endedAt ||
      note.expiresAt.getTime() <= Date.now() ||
      note.viewCount >= note.viewLimit
    ) {
      return null;
    }
    const res = await prisma.note.updateMany({
      where: { id, viewCount: note.viewCount, endedAt: null },
      data: { viewCount: { increment: 1 } },
    });
    if (res.count === 1) {
      return { note, last: note.viewCount + 1 >= note.viewLimit };
    }
  }
  return null;
}

/** Ends a note: standalone notes are deleted, collection notes are wiped. */
export async function endNote(note: Note, reason: "viewed" | "expired") {
  if (!note.collectionId) {
    await prisma.note.delete({ where: { id: note.id } }).catch(() => {});
    return;
  }
  await prisma.note
    .updateMany({
      where: { id: note.id, endedAt: null },
      data: {
        contentEncrypted: "",
        endedAt: new Date(),
        endReason: reason,
      },
    })
    .catch(() => {});
}

/**
 * Housekeeping. Pass a collectionId to only tidy that collection.
 * 1. expired standalone notes are deleted
 * 2. expired collection notes are wiped and marked "expired"
 * 3. ended collection notes older than 3 days are removed
 * 4. collections with no notes left are removed (the slug becomes free)
 */
export async function sweep(collectionId?: string): Promise<number> {
  const now = new Date();
  let removed = 0;

  if (!collectionId) {
    const r = await prisma.note.deleteMany({
      where: { collectionId: null, expiresAt: { lte: now } },
    });
    removed += r.count;
  }

  await prisma.note.updateMany({
    where: {
      ...(collectionId ? { collectionId } : { collectionId: { not: null } }),
      endedAt: null,
      expiresAt: { lte: now },
    },
    data: { contentEncrypted: "", endedAt: now, endReason: "expired" },
  });

  const purged = await prisma.note.deleteMany({
    where: {
      ...(collectionId ? { collectionId } : { collectionId: { not: null } }),
      endedAt: { lte: new Date(now.getTime() - ENDED_KEEP_MS) },
    },
  });
  removed += purged.count;

  const empty = await prisma.collection.deleteMany({
    where: {
      ...(collectionId ? { id: collectionId } : {}),
      notes: { none: {} },
    },
  });
  removed += empty.count;

  return removed;
}
