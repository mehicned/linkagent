"use client";

import { useState } from "react";
import { useSiteData } from "../site-shared";

export default function PagesPage() {
  const { data } = useSiteData();
  const { pages, clusters } = data;
  const clusterById = new Map(clusters.map((c) => [c.id, c]));
  const [sort, setSort] = useState<"path" | "in" | "words">("in");
  const sorted = [...pages].sort((a, b) =>
    sort === "path" ? a.path.localeCompare(b.path) : sort === "in" ? a.inDegree - b.inDegree : b.wordCount - a.wordCount,
  );

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
            <Th onClick={() => setSort("path")}>Page</Th>
            <Th onClick={() => setSort("words")}>Words</Th>
            <Th onClick={() => setSort("in")}>In</Th>
            <th className="px-4 py-3">Out</th>
            <th className="px-4 py-3">Depth</th>
            <th className="px-4 py-3">Cluster</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.id} className="border-b border-line/50 last:border-0 hover:bg-panel2/40">
              <td className="max-w-[340px] px-4 py-2.5">
                <div className="truncate font-medium" title={p.title}>
                  {p.title || p.path}
                </div>
                <div className="mono truncate text-xs text-faint">{p.path}</div>
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

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th className="cursor-pointer px-4 py-3 select-none hover:text-muted" onClick={onClick}>
      {children} ↕
    </th>
  );
}
