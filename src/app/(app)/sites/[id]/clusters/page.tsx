"use client";

import { useSiteData } from "../site-shared";

export default function ClustersPage() {
  const { data } = useSiteData();
  const { clusters, pages } = data;

  if (!clusters.length) {
    return <div className="card p-10 text-center text-sm text-muted">No clear topic clusters found on this site.</div>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {clusters
        .slice()
        .sort((a, b) => b.size - a.size)
        .map((c) => {
          const members = pages.filter((p) => p.clusterId === c.id);
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium capitalize">{c.label}</h3>
                <span className="chip">{c.size} pages</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.terms.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
              <ul className="mt-4 space-y-1.5">
                {members.slice(0, 8).map((p) => (
                  <li key={p.id} className="mono truncate text-xs text-muted" title={p.title}>
                    {p.path}
                  </li>
                ))}
                {members.length > 8 && <li className="text-xs text-faint">and {members.length - 8} more</li>}
              </ul>
            </div>
          );
        })}
    </div>
  );
}
