import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";
import { requireUser, userOwnsSite } from "@/lib/session";
import { gscConfigured, getAccessToken, listProperties, queryDaily, type GscDailyRow } from "@/lib/gsc";

export const maxDuration = 60;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function summarize(rows: GscDailyRow[]) {
  if (!rows.length) return { clicks: 0, impressions: 0, ctr: 0, position: 0, days: 0 };
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const position = rows.reduce((s, r) => s + r.position, 0) / rows.length;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position, days: rows.length };
}

// Search performance for a site: daily series plus a before/after summary
// split at the day the embed script went live.
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!gscConfigured()) return NextResponse.json({ configured: false });

  const siteId = Number(req.nextUrl.searchParams.get("siteId"));
  if (!siteId || !(await userOwnsSite(user.id, siteId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = await getAccessToken(user.id);
  if (!token) return NextResponse.json({ configured: true, connected: false });

  if (!site.gscProperty) {
    const properties = await listProperties(token);
    return NextResponse.json({ configured: true, connected: true, property: null, properties });
  }

  // Search Console data lags about two days behind.
  const end = Date.now() - 2 * 86400_000;
  const start = end - 120 * 86400_000;
  const daily = await queryDaily(token, site.gscProperty, isoDate(start), isoDate(end));

  let before = null;
  let after = null;
  if (site.firstPingAt) {
    const splitDate = isoDate(site.firstPingAt);
    const afterRows = daily.filter((r) => r.date >= splitDate);
    // Compare an equal number of days before the script went live.
    const window = Math.max(afterRows.length, 1);
    const beforeRows = daily.filter((r) => r.date < splitDate).slice(-window);
    before = summarize(beforeRows);
    after = summarize(afterRows);
  }

  return NextResponse.json({
    configured: true,
    connected: true,
    property: site.gscProperty,
    firstPingAt: site.firstPingAt,
    daily,
    before,
    after,
  });
}
