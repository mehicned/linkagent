import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db, sites, pages, clusters, opportunities, existingLinks } from "@/lib/db";
import { requireUser, claimUnownedSites, userOwnsSite } from "@/lib/session";
import { getUserPlan, allowedRefreshHours } from "@/lib/plans";

async function authorize(siteId: number): Promise<{ id: string } | null> {
  const user = await requireUser();
  if (!user) return null;
  await claimUnownedSites(user.id);
  return (await userOwnsSite(user.id, siteId)) ? user : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const siteId = Number(id);
  const user = await authorize(siteId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sitePages = await db
    .select({
      id: pages.id,
      url: pages.url,
      path: pages.path,
      title: pages.title,
      wordCount: pages.wordCount,
      depth: pages.depth,
      inDegree: pages.inDegree,
      outDegree: pages.outDegree,
      isOrphan: pages.isOrphan,
      clusterId: pages.clusterId,
    })
    .from(pages)
    .where(eq(pages.siteId, siteId))
    .orderBy(asc(pages.path));

  const siteClusters = await db.select().from(clusters).where(eq(clusters.siteId, siteId));
  const opps = await db.select().from(opportunities).where(eq(opportunities.siteId, siteId));
  const linkRows = await db
    .select({ id: existingLinks.id })
    .from(existingLinks)
    .where(eq(existingLinks.siteId, siteId));

  return NextResponse.json({
    site,
    plan: getUserPlan(user.id),
    pages: sitePages,
    clusters: siteClusters.map((c) => ({ ...c, terms: JSON.parse(c.terms) as string[] })),
    opportunities: opps.sort((a, b) => b.score - a.score),
    existingLinkCount: linkRows.length,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const siteId = Number(id);
  const user = await authorize(siteId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const updates: Partial<{
    mode: string;
    name: string;
    autoRefresh: number;
    refreshHours: number;
    maxLinksPerPage: number;
  }> = {};
  if (body?.mode === "approved" || body?.mode === "auto") updates.mode = body.mode;
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body?.autoRefresh === "boolean") updates.autoRefresh = body.autoRefresh ? 1 : 0;
  if (allowedRefreshHours(getUserPlan(user.id)).includes(body?.refreshHours)) {
    updates.refreshHours = body.refreshHours;
  }
  if (Number.isInteger(body?.maxLinksPerPage) && body.maxLinksPerPage >= 1 && body.maxLinksPerPage <= 20) {
    updates.maxLinksPerPage = body.maxLinksPerPage;
  }
  if (
    typeof body?.gscProperty === "string" &&
    (body.gscProperty.startsWith("sc-domain:") || /^https?:\/\//.test(body.gscProperty))
  ) {
    (updates as Record<string, unknown>).gscProperty = body.gscProperty;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  await db.update(sites).set(updates).where(eq(sites.id, siteId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const siteId = Number(id);
  if (!(await authorize(siteId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(opportunities).where(eq(opportunities.siteId, siteId));
  await db.delete(existingLinks).where(eq(existingLinks.siteId, siteId));
  await db.delete(clusters).where(eq(clusters.siteId, siteId));
  await db.delete(pages).where(eq(pages.siteId, siteId));
  await db.delete(sites).where(eq(sites.id, siteId));
  return NextResponse.json({ ok: true });
}
