import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";
import { discoverStructure } from "@/lib/crawler";
import { requireUser, claimUnownedSites, userOwnsSite } from "@/lib/session";

export const maxDuration = 60;

// Fast structure scan (sitemap or homepage links). Stores the sections on
// the site so the setup step can offer include and exclude choices before
// any real crawling happens.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const siteId = Number(id);
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await claimUnownedSites(user.id);
  if (!(await userOwnsSite(user.id, siteId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stored = JSON.parse(site.sections) as unknown[];
  if (stored.length) {
    return NextResponse.json({ total: null, sections: stored });
  }

  const { total, sections } = await discoverStructure(site.url);
  await db.update(sites).set({ sections: JSON.stringify(sections) }).where(eq(sites.id, siteId));
  return NextResponse.json({ total, sections });
}
