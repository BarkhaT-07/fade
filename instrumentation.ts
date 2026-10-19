export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sweep } = await import("@/lib/notes");
  const FIFTEEN_MINUTES = 15 * 60 * 1000;

  const run = async () => {
    try {
      const count = await sweep();
      if (count > 0) console.log(`[fade cleanup] removed ${count} item(s)`);
    } catch (err) {
      console.error("[fade cleanup] failed:", err);
    }
  };

  run();
  setInterval(run, FIFTEEN_MINUTES);
}
