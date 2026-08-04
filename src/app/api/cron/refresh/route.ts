import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 300;

// Hit daily by Vercel Cron (see vercel.json). Re-crawls every site with
// auto refresh turned on whose last crawl is older than its interval, so
// new posts get linked to and from without anyone opening the dashboard.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const all = await db.select().from(sites).where(eq(sites.autoRefresh, 1));
  const now = Date.now();
  const refreshed: string[] = [];
  for (const site of all) {
    if (site.status !== "ready") continue;
    const due = !site.lastCrawlAt || now - site.lastCrawlAt > site.refreshHours * 3600 * 1000;
    if (due) {
      await runPipeline(site.id);
      refreshed.push(site.host);
    }
  }
  return NextResponse.json({ ok: true, refreshed });
}
