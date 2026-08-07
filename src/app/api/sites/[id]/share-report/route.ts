import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, sites, pages, opportunities, freeScans } from "@/lib/db";
import { requireUser, userOwnsSite } from "@/lib/session";

// Turns a full-crawled site into a shareable report. The report reuses the
// scan report page; one stable token per site, refreshed with current
// numbers on every call, so the share link never goes stale.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const siteId = Number(id);
  if (!(await userOwnsSite(user.id, siteId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site || site.status !== "ready") {
    return NextResponse.json({ error: "Finish the crawl first." }, { status: 400 });
  }

  const sitePages = await db.select({ id: pages.id, path: pages.path }).from(pages).where(eq(pages.siteId, siteId));
  const pathById = new Map(sitePages.map((p) => [p.id, p.path]));
  const opps = await db.select().from(opportunities).where(eq(opportunities.siteId, siteId));
  const active = opps.filter((o) => o.status !== "rejected").sort((a, b) => b.score - a.score);

  const samples = active.slice(0, 3).map((o) => ({
    from: pathById.get(o.fromPageId) ?? "/",
    to: pathById.get(o.toPageId) ?? "/",
    anchor: o.anchor,
    sentence: o.sentence.length > 180 ? o.sentence.slice(0, 177) + "..." : o.sentence,
  }));

  const values = {
    userId: user.id,
    url: site.url,
    host: site.host,
    totalUrls: sitePages.length,
    pagesScanned: sitePages.length,
    oppCount: active.length,
    sections: site.sections,
    samples: JSON.stringify(samples),
    createdAt: Date.now(),
  };

  const [existing] = await db
    .select()
    .from(freeScans)
    .where(and(eq(freeScans.userId, user.id), eq(freeScans.host, site.host)))
    .orderBy(desc(freeScans.id))
    .limit(1);

  if (existing) {
    await db.update(freeScans).set(values).where(eq(freeScans.id, existing.id));
    return NextResponse.json({ token: existing.token });
  }

  const token = "scan_" + crypto.randomBytes(8).toString("hex");
  await db.insert(freeScans).values({ token, ...values });
  return NextResponse.json({ token });
}
