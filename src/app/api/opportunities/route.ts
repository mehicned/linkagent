import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, opportunities } from "@/lib/db";
import { requireUser, claimUnownedSites, userOwnsSite } from "@/lib/session";

// Bulk status changes: { siteId, ids?: number[], from?: "suggested", status: "approved" | "rejected" | "suggested" }
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const siteId = Number(body?.siteId);
  const status = body?.status;
  if (!siteId || !["approved", "rejected", "suggested"].includes(status)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await claimUnownedSites(user.id);
  if (!(await userOwnsSite(user.id, siteId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Array.isArray(body.ids) && body.ids.length) {
    await db
      .update(opportunities)
      .set({ status })
      .where(and(eq(opportunities.siteId, siteId), inArray(opportunities.id, body.ids.map(Number))));
  } else {
    const from = body?.from === "suggested" ? "suggested" : null;
    const where = from
      ? and(eq(opportunities.siteId, siteId), eq(opportunities.status, from))
      : eq(opportunities.siteId, siteId);
    await db.update(opportunities).set({ status }).where(where);
  }
  return NextResponse.json({ ok: true });
}
