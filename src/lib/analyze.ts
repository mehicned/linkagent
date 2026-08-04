import { buildTfidf, cosine, tokenize, topTerms, type Vec } from "./text";
import type { CrawledPage } from "./crawler";

export interface PageAnalysis {
  vectors: Vec[];
  topTermsPerPage: string[][];
  clusters: { label: string; terms: string[]; members: number[] }[]; // members = page indexes
  clusterOfPage: (number | null)[];
}

// Lets long synchronous loops breathe so API requests stay responsive while
// a pipeline runs. Everything here shares one Node event loop.
export const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

export async function analyzePages(pagesData: CrawledPage[]): Promise<PageAnalysis> {
  const docs = pagesData.map((p) =>
    tokenize(`${p.title} ${p.title} ${p.h1} ${p.h1} ${p.headings.join(" ")} ${p.text.slice(0, 20000)}`),
  );
  const { vectors } = buildTfidf(docs);
  const topTermsPerPage = vectors.map((v) => topTerms(v, 12));

  // Similarity graph above a threshold, then connected components as clusters.
  const n = pagesData.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const THRESHOLD = 0.22;
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) await yieldLoop();
    for (let j = i + 1; j < n; j++) {
      if (cosine(vectors[i], vectors[j]) >= THRESHOLD) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  const clusterOfPage: (number | null)[] = Array(n).fill(null);
  const clusters: { label: string; terms: string[]; members: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    if (clusterOfPage[i] !== null || adj[i].length === 0) continue;
    const members: number[] = [];
    const stack = [i];
    clusterOfPage[i] = clusters.length;
    while (stack.length) {
      const cur = stack.pop()!;
      members.push(cur);
      for (const next of adj[cur]) {
        if (clusterOfPage[next] === null) {
          clusterOfPage[next] = clusters.length;
          stack.push(next);
        }
      }
    }
    // Label = most common top terms across members.
    const counts = new Map<string, number>();
    for (const m of members) {
      for (const t of topTermsPerPage[m].slice(0, 6)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const terms = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);
    clusters.push({ label: terms.slice(0, 3).join(" · "), terms, members });
  }

  return { vectors, topTermsPerPage, clusters, clusterOfPage };
}

export interface GraphStats {
  inDegree: number[];
  outDegree: number[];
  depth: (number | null)[];
  isOrphan: boolean[];
}

// contentEdges: in-text links only, the ones that carry SEO equity. They
// drive in/out degree and orphan detection. allEdges (nav included) drive
// click depth, since depth is about how a crawler reaches the page at all.
export function graphStats(
  n: number,
  contentEdges: [number, number][],
  allEdges: [number, number][],
  homeIndex: number,
): GraphStats {
  const inDegree = Array(n).fill(0);
  const outDegree = Array(n).fill(0);
  const seenPair = new Set<string>();
  for (const [from, to] of contentEdges) {
    if (from === to) continue;
    const key = `${from}>${to}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    inDegree[to]++;
    outDegree[from]++;
  }

  const out: number[][] = Array.from({ length: n }, () => []);
  const seenAll = new Set<string>();
  for (const [from, to] of allEdges) {
    if (from === to) continue;
    const key = `${from}>${to}`;
    if (seenAll.has(key)) continue;
    seenAll.add(key);
    out[from].push(to);
  }
  const depth: (number | null)[] = Array(n).fill(null);
  if (homeIndex >= 0) {
    depth[homeIndex] = 0;
    const q = [homeIndex];
    while (q.length) {
      const cur = q.shift()!;
      for (const next of out[cur]) {
        if (depth[next] === null) {
          depth[next] = (depth[cur] as number) + 1;
          q.push(next);
        }
      }
    }
  }
  const isOrphan = inDegree.map((d, i) => d === 0 && i !== homeIndex);
  return { inDegree, outDegree, depth, isOrphan };
}
