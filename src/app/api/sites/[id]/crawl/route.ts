import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";
import { requireUser, claimUnownedSites, userOwnsSite } from "@/lib/session";
import { getUserPlan, clampRefreshHours } from "@/lib/plans";

export const maxDuration = 800;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const siteId = Number(id);
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await claimUnownedSites(user.id);
  if (!(await userOwnsSite(user.id, siteId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (site.status === "crawling" || site.status === "analyzing") {
    return NextResponse.json({ ok: true, already: true });
  }
  const body = await req.json().catch(() => null);
  if (Array.isArray(body?.excluded)) {
    const excluded = body.excluded.filter((p: unknown) => typeof p === "string").slice(0, 200);
    await db.update(sites).set({ excluded: JSON.stringify(excluded) }).where(eq(sites.id, siteId));
  }
  if (typeof body?.autopilot === "boolean") {
    await db
      .update(sites)
      .set({
        mode: body.autopilot ? "auto" : "approved",
        autoRefresh: body.autopilot ? 1 : 0,
        refreshHours: clampRefreshHours(getUserPlan(user.id), 24),
      })
      .where(eq(sites.id, siteId));
  }
  await runPipeline(siteId);
  const [fresh] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  return NextResponse.json({ ok: true, status: fresh?.status });
}
