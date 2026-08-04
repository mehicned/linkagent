"use client";

import { useMemo, useState } from "react";
import { useSiteData, type PageRow } from "../site-shared";

type SortKey = "path" | "words" | "in" | "out" | "depth" | "cluster";

// First click sorts with the column's natural direction; clicking the same
// column again flips it.
const DEFAULT_DIR: Record<SortKey, 1 | -1> = {
  path: 1,
  words: -1,
  in: 1, // ascending surfaces under-linked pages, the ones needing work
  out: -1,
  depth: -1,
  cluster: 1,
};

export default function PagesPage() {
  const { data } = useSiteData();
  const { pages, clusters } = data;
  const clusterById = useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters]);
  const [sortKey, setSortKey] = useState<SortKey>("in");
  const [dir, setDir] = useState<1 | -1>(DEFAULT_DIR.in);

  function clickSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setDir(DEFAULT_DIR[key]);
    }
  }

  const sorted = useMemo(() => {
    const value = (p: PageRow): string | number => {
      switch (sortKey) {
        case "path":
          return p.path;
        case "words":
          return p.wordCount;
        case "in":
          return p.inDegree;
        case "out":
          return p.outDegree;
        case "depth":
          return p.depth ?? Number.MAX_SAFE_INTEGER;
        case "cluster":
          return (p.clusterId && clusterById.get(p.clusterId)?.label) || "￿";
      }
    };
    return [...pages].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return cmp * dir;
    });
  }, [pages, sortKey, dir, clusterById]);

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      className={`cursor-pointer whitespace-nowrap px-4 py-3 select-none transition-colors hover:text-body ${
        sortKey === k ? "text-body" : ""
      }`}
      onClick={() => clickSort(k)}
    >
      {children}
      <span className={`ml-1 ${sortKey === k ? "text-accent" : "text-faint"}`}>
        {sortKey === k ? (dir === 1 ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
            <Th k="path">Page</Th>
            <Th k="words">Words</Th>
            <Th k="in">In</Th>
            <Th k="out">Out</Th>
            <Th k="depth">Depth</Th>
            <Th k="cluster">Cluster</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-b border-line/50 last:border-0 hover:bg-panel2/40">
              <td className="max-w-[340px] px-4 py-2.5">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block" title={p.title}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium underline-offset-4 group-hover:underline">
                      {p.title || p.path}
                    </span>
                    <svg
                      viewBox="0 0 20 20"
                      className="h-3 w-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M8 5h7v7m0-7L7 13" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="mono truncate text-xs text-faint">{p.path}</div>
                </a>
              </td>
              <td className="num px-4 py-2.5 text-muted">{p.wordCount.toLocaleString()}</td>
              <td className="px-4 py-2.5">
                {p.isOrphan ? (
                  <span className="chip border-warn/40 text-warn">orphan</span>
                ) : (
                  <span className="num">{p.inDegree}</span>
                )}
              </td>
              <td className="num px-4 py-2.5 text-muted">{p.outDegree}</td>
              <td className="num px-4 py-2.5 text-muted">{p.depth ?? "–"}</td>
              <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-muted">
                {p.clusterId ? clusterById.get(p.clusterId)?.label : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
