"use client";

import { useMemo, useState } from "react";
import { useSiteData, type Opp, type PageRow, type Site } from "./site-shared";

export default function OpportunitiesPage() {
  const { data, reload } = useSiteData();
  const { site, opportunities } = data;
  const pageById = useMemo(() => new Map(data.pages.map((p) => [p.id, p])), [data.pages]);

  const [filter, setFilter] = useState<"all" | "suggested" | "approved" | "rejected">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // The default view shows everything: suggestions needing a decision come
  // first, live approved links next, rejected last. One click narrows down.
  const STATUS_ORDER: Record<string, number> = { suggested: 0, approved: 1, rejected: 2 };
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return opportunities
      .filter((o) => filter === "all" || o.status === filter)
      .filter((o) => {
        if (!q) return true;
        const from = pageById.get(o.fromPageId)?.path ?? "";
        const to = pageById.get(o.toPageId)?.path ?? "";
        return (o.anchor + from + to).toLowerCase().includes(q);
      })
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunities, filter, query, pageById]);

  async function setStatus(oppId: number, status: string) {
    await fetch(`/api/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    reload();
  }

  async function approveAll() {
    setBusy(true);
    await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, from: "suggested", status: "approved" }),
    });
    setBusy(false);
    reload();
  }

  const counts = {
    all: opportunities.length,
    suggested: opportunities.filter((o) => o.status === "suggested").length,
    approved: opportunities.filter((o) => o.status === "approved").length,
    rejected: opportunities.filter((o) => o.status === "rejected").length,
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["all", "suggested", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`chip capitalize transition-colors ${
                filter === f ? "border-line2 bg-panel2 text-body" : "hover:border-line2 hover:text-body"
              }`}
            >
              {f} · {counts[f]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by anchor or path"
            className="card w-56 rounded-lg px-3 py-1.5 text-sm outline-none placeholder:text-faint focus:border-line2"
          />
          {(filter === "all" || filter === "suggested") && counts.suggested > 0 && (
            <button onClick={approveAll} disabled={busy} className="btn btn-primary btn-sm">
              Approve all suggested
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          {filter === "all" ? "No link opportunities yet. Re-crawl to look again." : `Nothing ${filter} yet.`}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, 200).map((o) => (
            <OppCard key={o.id} opp={o} site={site} pageById={pageById} onStatus={setStatus} />
          ))}
          {filtered.length > 200 && (
            <p className="pt-2 text-center text-sm text-faint">Showing the first 200. Use the filter to narrow down.</p>
          )}
        </div>
      )}
    </div>
  );
}

function OppCard({
  opp,
  site,
  pageById,
  onStatus,
}: {
  opp: Opp;
  site: Site;
  pageById: Map<number, PageRow>;
  onStatus: (id: number, status: string) => void;
}) {
  const from = pageById.get(opp.fromPageId);
  const to = pageById.get(opp.toPageId);
  const score = Math.round(Math.min(opp.score, 1) * 100);
  const [copied, setCopied] = useState(false);

  const sentence = opp.sentence;
  const idx = sentence.toLowerCase().indexOf(opp.anchor.toLowerCase());
  const before = idx >= 0 ? sentence.slice(0, idx) : sentence;
  const match = idx >= 0 ? sentence.slice(idx, idx + opp.anchor.length) : "";
  const after = idx >= 0 ? sentence.slice(idx + opp.anchor.length) : "";

  async function copyHtml() {
    await navigator.clipboard.writeText(`<a href="${to?.path}">${match || opp.anchor}</a>`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const statusDot = opp.status === "approved" ? "bg-good" : opp.status === "rejected" ? "bg-bad" : "bg-accent";

  return (
    <div className={`card p-5 ${opp.status === "rejected" ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="chip capitalize shrink-0">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {opp.status === "approved" ? "Live" : opp.status}
          </span>
          <span className="mono truncate max-w-[220px] text-faint" title={from?.path}>
            {from?.path}
          </span>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 10h12m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="mono truncate max-w-[220px] text-body" title={to?.path}>
            {to?.path}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {opp.source === "ai" && <span className="chip">AI picked</span>}
          <ScoreBar score={score} />
          {(opp.status === "approved" || (site.mode === "auto" && opp.status === "suggested")) && (
            <a
              href={`${site.url}${from?.path ?? ""}#la=${encodeURIComponent(match || opp.anchor)}:~:text=${encodeURIComponent(match || opp.anchor)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
              title="Open the page and jump to this link"
            >
              View live
            </a>
          )}
          <button onClick={copyHtml} className="btn btn-ghost btn-sm" title="Copy the link as HTML">
            {copied ? "Copied" : "Copy HTML"}
          </button>
          {opp.status !== "approved" && (
            <button onClick={() => onStatus(opp.id, "approved")} className="btn btn-primary btn-sm">
              Approve
            </button>
          )}
          {opp.status !== "rejected" && (
            <button onClick={() => onStatus(opp.id, "rejected")} className="btn btn-ghost btn-sm">
              Reject
            </button>
          )}
          {opp.status !== "suggested" && (
            <button onClick={() => onStatus(opp.id, "suggested")} className="btn btn-ghost btn-sm">
              Undo
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 rounded-lg border border-line bg-ink px-4 py-3 text-[14.5px] leading-relaxed text-muted">
        {idx >= 0 ? (
          <>
            {before}
            <mark className="anchor">{match}</mark>
            {after}
          </>
        ) : (
          sentence
        )}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
        <span>
          Links to <span className="text-muted">{to?.title || to?.path}</span>
          {opp.clicks > 0 && (
            <span className="ml-2 text-good">
              · <span className="num font-medium">{opp.clicks}</span> click{opp.clicks === 1 ? "" : "s"} (30d)
            </span>
          )}
        </span>
        <span>{opp.reason}</span>
      </div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5" title={`Confidence ${score}/100`}>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${score}%` }} />
      </div>
      <span className="mono num w-6 text-right text-[11px] text-muted">{score}</span>
    </div>
  );
}
