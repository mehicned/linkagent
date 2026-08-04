// Background scheduler for continuous mode on self-hosted long-running
// servers. On Vercel this interval never fires usefully, so the same work
// runs through the daily cron at /api/cron/refresh instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return;
  const g = globalThis as unknown as { __linkagentScheduler?: boolean };
  if (g.__linkagentScheduler) return;
  g.__linkagentScheduler = true;

  const { db, sites } = await import("@/lib/db");
  const { runPipeline } = await import("@/lib/pipeline");
  const { eq } = await import("drizzle-orm");
  const { getUserPlan, clampRefreshHours } = await import("@/lib/plans");

  const tick = async () => {
    try {
      const all = await db.select().from(sites).where(eq(sites.autoRefresh, 1));
      const now = Date.now();
      for (const site of all) {
        if (site.status !== "ready") continue;
        const hours = clampRefreshHours(getUserPlan(site.userId), site.refreshHours);
        const due = !site.lastCrawlAt || now - site.lastCrawlAt > hours * 3600 * 1000;
        if (due) await runPipeline(site.id);
      }
    } catch {
      /* never let the scheduler crash the server */
    }
  };

  setInterval(tick, 15 * 60 * 1000);
  setTimeout(tick, 30 * 1000);
}
