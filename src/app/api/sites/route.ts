import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and, count } from "drizzle-orm";
import crypto from "node:crypto";
import { db, sites, opportunities, pages } from "@/lib/db";
import { stripWww } from "@/lib/extract";
import { requireUser, claimUnownedSites } from "@/lib/session";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json([], { status: 200 });
  await claimUnownedSites(user.id);
  const all = await db.select().from(sites).where(eq(sites.userId, user.id)).orderBy(desc(sites.createdAt));
  const withCounts = await Promise.all(
    all.map(async (s) => {
      const [suggested] = await db
        .select({ n: count() })
        .from(opportunities)
        .where(and(eq(opportunities.siteId, s.id), eq(opportunities.status, "suggested")));
      const [approved] = await db
        .select({ n: count() })
        .from(opportunities)
        .where(and(eq(opportunities.siteId, s.id), eq(opportunities.status, "approved")));
      const [pageCount] = await db.select({ n: count() }).from(pages).where(eq(pages.siteId, s.id));
      return { ...s, suggested: suggested?.n ?? 0, approved: approved?.n ?? 0, pages: pageCount?.n ?? 0 };
    }),
  );
  return NextResponse.json(withCounts);
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
  if (!rawUrl) return NextResponse.json({ error: "Enter a site URL." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return NextResponse.json({ error: "That does not look like a valid URL." }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http and https sites are supported." }, { status: 400 });
  }
  const host = stripWww(parsed.hostname);
  if (!host.includes(".") && host !== "localhost") {
    return NextResponse.json({ error: "That does not look like a valid host." }, { status: 400 });
  }

  const maxPages = Number(process.env.LINKAGENT_MAX_PAGES) || 500;
  const [site] = await db
    .insert(sites)
    .values({
      userId: user.id,
      url: parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname),
      host,
      name: host,
      publicKey: "pk_" + crypto.randomBytes(9).toString("hex"),
      status: "new",
      maxPages,
      createdAt: Date.now(),
    })
    .returning();

  return NextResponse.json(site, { status: 201 });
}
