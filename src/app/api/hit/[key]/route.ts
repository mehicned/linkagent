import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, sites, linkClicks } from "@/lib/db";
import { normalizePath } from "@/lib/extract";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// Click beacon from the embed script. Body is "fromPath|toPath". Counters
// only: no cookies, no IPs, no visitor identity stored.
export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const body = (await req.text().catch(() => "")).slice(0, 600);
  const split = body.indexOf("|");
  if (split < 1) return new NextResponse(null, { status: 204, headers: CORS });

  const fromPath = normalizePath(body.slice(0, split));
  const toPath = normalizePath(body.slice(split + 1));
  if (!fromPath.startsWith("/") || !toPath.startsWith("/")) {
    return new NextResponse(null, { status: 204, headers: CORS });
  }

  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.publicKey, key)).limit(1);
  if (!site) return new NextResponse(null, { status: 204, headers: CORS });

  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(linkClicks)
    .values({ siteId: site.id, day, fromPath, toPath, count: 1 })
    .onConflictDoUpdate({
      target: [linkClicks.siteId, linkClicks.day, linkClicks.fromPath, linkClicks.toPath],
      set: { count: sql`${linkClicks.count} + 1` },
    });

  return new NextResponse(null, { status: 204, headers: CORS });
}
