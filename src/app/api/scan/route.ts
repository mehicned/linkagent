import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db, freeScans } from "@/lib/db";
import { discoverStructure, crawlSite, crawlUrls } from "@/lib/crawler";
import { stripWww } from "@/lib/extract";
import { analyzePages } from "@/lib/analyze";
import { findOpportunities } from "@/lib/opportunities";
import { normalizePhrase } from "@/lib/text";
import { requireUser } from "@/lib/session";

export const maxDuration = 120;

const TEASER_PAGES = 20;
const SAMPLE_COUNT = 3;
const CACHE_DAYS = 7;

// Anonymous teaser scan for the landing page: quick structure read plus a
// shallow crawl of a handful of pages, heuristic opportunities only. The
// result shows a few examples and the full count sits behind signup.
export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "Only http and https sites work." }, { status: 400 });
  }

  // A recent scan of the same host is reused instead of crawling again.
  const user = await requireUser();
  const host = stripWww(parsed.hostname);
  const [cached] = await db
    .select()
    .from(freeScans)
    .where(and(eq(freeScans.host, host), gte(freeScans.createdAt, Date.now() - CACHE_DAYS * 86400_000)))
    .orderBy(desc(freeScans.id))
    .limit(1);
  if (cached) {
    if (user && !cached.userId) {
      await db.update(freeScans).set({ userId: user.id }).where(and(eq(freeScans.id, cached.id), isNull(freeScans.userId)));
    }
    return NextResponse.json({
      token: cached.token,
      host: cached.host,
      totalUrls: cached.totalUrls,
      pagesScanned: cached.pagesScanned,
      oppCount: cached.oppCount,
      samples: JSON.parse(cached.samples),
      cached: true,
    });
  }

  const { total, sections } = await discoverStructure(parsed.origin);

  // Sample a diverse slice: round-robin across sections instead of the
  // first N sitemap entries, which are usually all from one section.
  const seedPaths: string[] = [];
  let round = 0;
  while (seedPaths.length < TEASER_PAGES && round < 3) {
    let added = false;
    for (const section of sections) {
      const sample = section.samples[round];
      if (sample && !seedPaths.includes(sample)) {
        seedPaths.push(sample);
        added = true;
        if (seedPaths.length >= TEASER_PAGES) break;
      }
    }
    if (!added) break;
    round++;
  }

  const crawled = seedPaths.length
    ? await crawlUrls(seedPaths.map((p) => parsed.origin + (p === "/" ? "" : p)))
    : await crawlSite(parsed.origin, TEASER_PAGES);
  if (crawled.length === 0) {
    return NextResponse.json({ error: "Could not read any pages on that site." }, { status: 422 });
  }

  const analysis = await analyzePages(crawled);
  const indexByUrl = new Map(crawled.map((p, i) => [p.url, i] as const));
  const edgeSet = new Set<string>();
  const existingAnchorsByPage = new Map<number, Set<string>>();
  const inDegree = Array(crawled.length).fill(0);
  crawled.forEach((p, from) => {
    for (const link of p.contentLinks) {
      const to = indexByUrl.get(link.href);
      if (to !== undefined && to !== from) {
        edgeSet.add(`${from}>${to}`);
        inDegree[to]++;
        const norm = normalizePhrase(link.anchor);
        if (norm) {
          if (!existingAnchorsByPage.has(from)) existingAnchorsByPage.set(from, new Set());
          existingAnchorsByPage.get(from)!.add(norm);
        }
      }
    }
  });

  const opps = await findOpportunities(
    crawled,
    analysis.vectors,
    analysis.topTermsPerPage,
    inDegree,
    edgeSet,
    existingAnchorsByPage,
    6,
    analysis.clusterOfPage,
  );

  // Show the most impressive examples: longest anchors first, one per
  // target page, so the teaser never looks repetitive or generic.
  const ranked = [...opps].sort((a, b) => {
    const words = b.anchor.split(/\s+/).length - a.anchor.split(/\s+/).length;
    return words !== 0 ? words : b.score - a.score;
  });
  const usedTargets = new Set<string>();
  const usedPairs = new Set<string>();
  const samples: { from: string; to: string; anchor: string; sentence: string }[] = [];
  for (const o of ranked) {
    const toPath = crawled[o.toIndex].path;
    const fromPath = crawled[o.fromIndex].path;
    const pairKey = [fromPath, toPath].sort().join("|");
    if (usedTargets.has(toPath) || usedPairs.has(pairKey)) continue;
    usedTargets.add(toPath);
    usedPairs.add(pairKey);
    samples.push({
      from: crawled[o.fromIndex].path,
      to: toPath,
      anchor: o.anchor,
      sentence: o.sentence.length > 180 ? o.sentence.slice(0, 177) + "..." : o.sentence,
    });
    if (samples.length === SAMPLE_COUNT) break;
  }

  const token = "scan_" + crypto.randomBytes(8).toString("hex");
  await db.insert(freeScans)
    .values({
      token,
      userId: user?.id ?? null,
      url: parsed.origin,
      host,
      totalUrls: Math.max(total, crawled.length),
      pagesScanned: crawled.length,
      oppCount: opps.length,
      sections: JSON.stringify(sections),
      samples: JSON.stringify(samples),
      createdAt: Date.now(),
    });

  return NextResponse.json({
    token,
    host: stripWww(parsed.hostname),
    totalUrls: Math.max(total, crawled.length),
    pagesScanned: crawled.length,
    oppCount: opps.length,
    samples,
  });
}
