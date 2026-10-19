// Same housekeeping as lib/notes.ts sweep(), for running from cron.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ENDED_KEEP_MS = 3 * 24 * 3600 * 1000;

async function main() {
  const now = new Date();
  let removed = 0;

  removed += (
    await prisma.note.deleteMany({ where: { collectionId: null, expiresAt: { lte: now } } })
  ).count;

  await prisma.note.updateMany({
    where: { collectionId: { not: null }, endedAt: null, expiresAt: { lte: now } },
    data: { contentEncrypted: "", endedAt: now, endReason: "expired" },
  });

  removed += (
    await prisma.note.deleteMany({
      where: {
        collectionId: { not: null },
        endedAt: { lte: new Date(now.getTime() - ENDED_KEEP_MS) },
      },
    })
  ).count;

  removed += (await prisma.collection.deleteMany({ where: { notes: { none: {} } } })).count;

  console.log(`[fade cleanup] removed ${removed} item(s) at ${now.toISOString()}`);
}

main()
  .catch((err) => {
    console.error("[fade cleanup] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
