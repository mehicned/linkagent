import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, freeScans } from "@/lib/db";
import { requireUser } from "@/lib/session";

// The signed-in user's own scan reports, newest first.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      token: freeScans.token,
      host: freeScans.host,
      oppCount: freeScans.oppCount,
      pagesScanned: freeScans.pagesScanned,
      totalUrls: freeScans.totalUrls,
      createdAt: freeScans.createdAt,
    })
    .from(freeScans)
    .where(eq(freeScans.userId, user.id))
    .orderBy(desc(freeScans.id))
    .limit(20);
  return NextResponse.json(rows);
}
