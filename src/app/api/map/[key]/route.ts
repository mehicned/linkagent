import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, sites, pages, opportunities } from "@/lib/db";
import { normalizePath, stripWww } from "@/lib/extract";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// GET /api/map/pk_xxx?p=/some/path -> link rules for that path only.
// Without p, returns the full map keyed by path (useful for exports and SSR).
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const [site] = await db.select().from(sites).where(eq(sites.publicKey, key)).limit(1);
  if (!site) return NextResponse.json({ error: "Unknown key" }, { status: 404, headers: CORS });

  // Record when the script goes live on the client's own site. The referer
  // check keeps dashboard visits and curl tests from counting as installs.
  // This date anchors before and after SEO comparisons.
  const referer = req.headers.get("referer") ?? req.headers.get("origin") ?? "";
  try {
    if (referer && stripWww(new URL(referer).hostname) === stripWww(site.host)) {
      const now = Date.now();
      const stale = !site.lastPingAt || now - site.lastPingAt > 5 * 60 * 1000;
      if (!site.firstPingAt) {
        await db.update(sites).set({ firstPingAt: now, lastPingAt: now }).where(eq(sites.id, site.id));
      } else if (stale) {
        await db.update(sites).set({ lastPingAt: now }).where(eq(sites.id, site.id));
      }
    }
  } catch {
    /* bad referer header, ignore */
  }

  const statuses = site.mode === "auto" ? ["approved", "suggested"] : ["approved"];
  const opps = await db
    .select({
      anchor: opportunities.anchor,
      score: opportunities.score,
      fromPageId: opportunities.fromPageId,
      toPageId: opportunities.toPageId,
    })
    .from(opportunities)
    .where(and(eq(opportunities.siteId, site.id), inArray(opportunities.status, statuses)));

  const sitePages = await db
    .select({ id: pages.id, path: pages.path, title: pages.title })
    .from(pages)
    .where(eq(pages.siteId, site.id));
  const pageById = new Map(sitePages.map((p) => [p.id, p]));

  const requestedPath = req.nextUrl.searchParams.get("p");

  type Rule = { t: string; h: string; ti?: string; s: number };
  const byPath = new Map<string, Rule[]>();
  for (const o of opps) {
    const from = pageById.get(o.fromPageId);
    const to = pageById.get(o.toPageId);
    if (!from || !to || from.path === to.path) continue;
    const rule: Rule = { t: o.anchor, h: to.path, ti: to.title || undefined, s: o.score };
    if (!byPath.has(from.path)) byPath.set(from.path, []);
    byPath.get(from.path)!.push(rule);
  }
  for (const rules of byPath.values()) rules.sort((a, b) => b.s - a.s);

  const strip = (rules: Rule[]) =>
    rules.slice(0, Math.max(1, site.maxLinksPerPage)).map(({ t, h, ti }) => ({ t, h, ti }));

  if (requestedPath !== null) {
    const rules = byPath.get(normalizePath(requestedPath)) ?? [];
    return NextResponse.json({ v: 1, rules: strip(rules) }, { headers: CORS });
  }

  const full: Record<string, { t: string; h: string; ti?: string }[]> = {};
  for (const [path, rules] of byPath) full[path] = strip(rules);
  return NextResponse.json({ v: 1, map: full }, { headers: CORS });
}
