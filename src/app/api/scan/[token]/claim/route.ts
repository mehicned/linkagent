import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, sites, freeScans } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Turns an anonymous teaser scan into a real site for the signed-in user,
// carrying the discovered sections straight into onboarding step 2.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { token } = await ctx.params;
  const [scan] = await db.select().from(freeScans).where(eq(freeScans.token, token)).limit(1);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  if (scan.claimedSiteId) {
    const [existing] = await db.select().from(sites).where(eq(sites.id, scan.claimedSiteId)).limit(1);
    if (existing && existing.userId === user.id) return NextResponse.json({ siteId: existing.id });
  }

  const maxPages = Number(process.env.LINKAGENT_MAX_PAGES) || 500;
  const [site] = await db
    .insert(sites)
    .values({
      userId: user.id,
      url: scan.url,
      host: scan.host,
      name: scan.host,
      publicKey: "pk_" + crypto.randomBytes(9).toString("hex"),
      status: "new",
      sections: scan.sections,
      maxPages,
      createdAt: Date.now(),
    })
    .returning({ id: sites.id });

  await db.update(freeScans).set({ claimedSiteId: site.id }).where(eq(freeScans.id, scan.id));
  return NextResponse.json({ siteId: site.id });
}
