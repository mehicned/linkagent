import { eq } from "drizzle-orm";
import { db, sites, pages, existingLinks, clusters, opportunities } from "./db";
import { crawlSite, makeExclusionCheck, type SiteSection } from "./crawler";
import { analyzePages, graphStats } from "./analyze";
import { findOpportunities } from "./opportunities";
import { refineWithAI, clusterWithAI } from "./ai";
import { normalizePhrase } from "./text";

const running = new Set<number>();

export async function runPipeline(siteId: number): Promise<void> {
  if (running.has(siteId)) return;
  running.add(siteId);
  try {
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) return;

    await db.update(sites).set({ status: "crawling", error: null, pagesFound: 0 }).where(eq(sites.id, siteId));

    let sections: SiteSection[] = [];
    let excluded: string[] = [];
    try {
      sections = JSON.parse(site.sections);
      excluded = JSON.parse(site.excluded);
    } catch {
      /* older rows without section data */
    }
    const isExcluded = makeExclusionCheck(sections, excluded);

    // Progress updates are throttled: every row write is a network round
    // trip on hosted Postgres, unlike the old local SQLite file.
    let lastProgressWrite = 0;
    const crawled = await crawlSite(site.url, site.maxPages, isExcluded, (count) => {
      const now = Date.now();
      if (now - lastProgressWrite > 2000) {
        lastProgressWrite = now;
        db.update(sites).set({ pagesFound: count }).where(eq(sites.id, siteId)).catch(() => {});
      }
    });

    if (crawled.length === 0) {
      await db
        .update(sites)
        .set({ status: "error", error: "Could not crawl any pages. Check the URL and try again." })
        .where(eq(sites.id, siteId));
      return;
    }

    await db.update(sites).set({ status: "analyzing", pagesFound: crawled.length }).where(eq(sites.id, siteId));

    // Remember review decisions so re-crawls (manual or scheduled) never
    // undo an approval or bring back a rejected link.
    const oldOpps = await db.select().from(opportunities).where(eq(opportunities.siteId, siteId));
    const oldPages = await db.select({ id: pages.id, path: pages.path }).from(pages).where(eq(pages.siteId, siteId));
    const oldPathById = new Map(oldPages.map((p) => [p.id, p.path]));
    const decisions = new Map<string, string>();
    for (const o of oldOpps) {
      if (o.status === "suggested") continue;
      const fromPath = oldPathById.get(o.fromPageId);
      const toPath = oldPathById.get(o.toPageId);
      if (fromPath && toPath) decisions.set(`${fromPath}>${toPath}`, o.status);
    }

    // Everything is computed in memory BEFORE any old data is deleted, so
    // live sites keep serving their current link map through almost the
    // entire re-crawl. The delete-and-insert swap at the end takes seconds.
    const analysis = await analyzePages(crawled);

    // Map URLs to page indexes to resolve the internal link graph.
    const indexByUrl = new Map<string, number>();
    crawled.forEach((p, i) => indexByUrl.set(p.url, i));

    // Only in-text links count as the SEO link graph. Nav and footer links
    // are used for click depth but never for equity stats or dedup.
    const contentEdges: [number, number][] = [];
    const edgeAnchors: string[] = [];
    crawled.forEach((p, from) => {
      for (const link of p.contentLinks) {
        const to = indexByUrl.get(link.href);
        if (to !== undefined && to !== from) {
          contentEdges.push([from, to]);
          edgeAnchors.push(link.anchor);
        }
      }
    });
    const allEdges: [number, number][] = [];
    crawled.forEach((p, from) => {
      for (const link of p.links) {
        const to = indexByUrl.get(link.href);
        if (to !== undefined && to !== from) allEdges.push([from, to]);
      }
    });

    const homeIndex = crawled.findIndex((p) => p.path === "/");
    const stats = graphStats(crawled.length, contentEdges, allEdges, homeIndex);

    // Claude reads titles and clusters far better than the similarity
    // graph, which tends to merge a whole site into one blob. Falls back
    // to the heuristic clusters without an API key.
    let finalClusters = analysis.clusters;
    let clusterOfPage = analysis.clusterOfPage;
    const aiClusters = await clusterWithAI(
      crawled.map((p, i) => ({ path: p.path, title: p.title || p.h1, terms: analysis.topTermsPerPage[i] })),
    );
    if (aiClusters) {
      finalClusters = aiClusters.map((c) => {
        const counts = new Map<string, number>();
        for (const m of c.members) {
          for (const t of analysis.topTermsPerPage[m].slice(0, 6)) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        const terms = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([t]) => t);
        return { label: c.label, terms, members: c.members };
      });
      clusterOfPage = Array(crawled.length).fill(null);
      finalClusters.forEach((c, ci) => c.members.forEach((m) => (clusterOfPage[m] = ci)));
    }

    // The existing in-text link graph, index based. Database ids do not
    // exist yet; rows are materialized after the swap below.
    const edgeSet = new Set<string>();
    const existingAnchorsByPage = new Map<number, Set<string>>();
    const dedupedEdges: { from: number; to: number; anchor: string }[] = [];
    contentEdges.forEach(([from, to], i) => {
      const key = `${from}>${to}`;
      const anchorNorm = normalizePhrase(edgeAnchors[i]);
      if (anchorNorm) {
        if (!existingAnchorsByPage.has(from)) existingAnchorsByPage.set(from, new Set());
        existingAnchorsByPage.get(from)!.add(anchorNorm);
      }
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      dedupedEdges.push({ from, to, anchor: edgeAnchors[i] });
    });

    // Find, then optionally refine, opportunities. Still all in memory.
    const raw = await findOpportunities(
      crawled,
      analysis.vectors,
      analysis.topTermsPerPage,
      stats.inDegree,
      edgeSet,
      existingAnchorsByPage,
      site.maxLinksPerPage,
      clusterOfPage,
      stats.isOrphan,
      stats.depth,
    );
    const refined = await refineWithAI(raw, crawled);

    // The swap: everything above is computed, so live maps only blink for
    // the few seconds these deletes and inserts take.
    await db.delete(pages).where(eq(pages.siteId, siteId));
    await db.delete(existingLinks).where(eq(existingLinks.siteId, siteId));
    await db.delete(clusters).where(eq(clusters.siteId, siteId));
    await db.delete(opportunities).where(eq(opportunities.siteId, siteId));

    // Insert clusters first to get their DB ids.
    const clusterDbIds: number[] = [];
    for (const c of finalClusters) {
      const [row] = await db
        .insert(clusters)
        .values({ siteId, label: c.label, terms: JSON.stringify(c.terms), size: c.members.length })
        .returning({ id: clusters.id });
      clusterDbIds.push(row.id);
    }

    // Insert pages in batches to keep round trips low.
    const pageDbIds: number[] = new Array(crawled.length);
    const BATCH = 25;
    for (let start = 0; start < crawled.length; start += BATCH) {
      const slice = crawled.slice(start, start + BATCH);
      const rows = await db
        .insert(pages)
        .values(
          slice.map((p, offset) => {
            const i = start + offset;
            const clusterIdx = clusterOfPage[i];
            return {
              siteId,
              url: p.url,
              path: p.path,
              title: p.title,
              h1: p.h1,
              description: p.description,
              headings: JSON.stringify(p.headings),
              text: p.text,
              wordCount: p.wordCount,
              depth: stats.depth[i],
              inDegree: stats.inDegree[i],
              outDegree: stats.outDegree[i],
              isOrphan: stats.isOrphan[i] ? 1 : 0,
              clusterId: clusterIdx === null ? null : clusterDbIds[clusterIdx],
            };
          }),
        )
        .returning({ id: pages.id });
      rows.forEach((r, offset) => {
        pageDbIds[start + offset] = r.id;
      });
    }

    const linkRows = dedupedEdges.map((e) => ({
      siteId,
      fromPageId: pageDbIds[e.from],
      toPageId: pageDbIds[e.to],
      anchor: e.anchor,
    }));
    for (let start = 0; start < linkRows.length; start += 100) {
      await db.insert(existingLinks).values(linkRows.slice(start, start + 100));
    }

    const now = Date.now();
    const oppRows = refined.map((o) => {
      const key = `${crawled[o.fromIndex].path}>${crawled[o.toIndex].path}`;
      return {
        siteId,
        fromPageId: pageDbIds[o.fromIndex],
        toPageId: pageDbIds[o.toIndex],
        anchor: o.anchor,
        sentence: o.sentence,
        score: o.score,
        source: o.source,
        reason: o.reason,
        status: decisions.get(key) ?? "suggested",
        createdAt: now,
      };
    });
    for (let start = 0; start < oppRows.length; start += 100) {
      await db.insert(opportunities).values(oppRows.slice(start, start + 100));
    }

    await db
      .update(sites)
      .set({ status: "ready", pagesFound: crawled.length, lastCrawlAt: now })
      .where(eq(sites.id, siteId));
  } catch (err) {
    await db
      .update(sites)
      .set({ status: "error", error: err instanceof Error ? err.message : "Something went wrong." })
      .where(eq(sites.id, siteId))
      .catch(() => {});
  } finally {
    running.delete(siteId);
  }
}
