import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, opportunities } from "@/lib/db";
import { requireUser, claimUnownedSites, userOwnsSite } from "@/lib/session";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const oppId = Number(id);
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await claimUnownedSites(user.id);
  const [opp] = await db
    .select({ siteId: opportunities.siteId })
    .from(opportunities)
    .where(eq(opportunities.id, oppId))
    .limit(1);
  if (!opp || !(await userOwnsSite(user.id, opp.siteId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const updates: Partial<{ status: string; anchor: string }> = {};
  if (["approved", "rejected", "suggested"].includes(body?.status)) updates.status = body.status;
  if (typeof body?.anchor === "string" && body.anchor.trim().length >= 3) updates.anchor = body.anchor.trim();
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  await db.update(opportunities).set(updates).where(eq(opportunities.id, oppId));
  return NextResponse.json({ ok: true });
}
