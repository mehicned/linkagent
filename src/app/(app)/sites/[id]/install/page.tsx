"use client";

import { useEffect, useState } from "react";
import { useSiteData } from "../site-shared";

const REFRESH_OPTIONS: { hours: number; label: string; minPlan: "free" | "starter" | "pro" }[] = [
  { hours: 24, label: "Daily", minPlan: "pro" },
  { hours: 168, label: "Weekly", minPlan: "starter" },
  { hours: 720, label: "Monthly", minPlan: "free" },
];
const PLAN_RANK = { free: 0, starter: 1, pro: 2 };

export default function InstallPage() {
  const { data, reload } = useSiteData();
  const { site, plan, opportunities } = data;
  const approved = opportunities.filter((o) => o.status === "approved").length;
  const suggested = opportunities.filter((o) => o.status === "suggested").length;

  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const snippet = `<script src="${origin}/linkagent.js" data-key="${site.publicKey}" defer></script>`;

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/sites/${site.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    reload();
  }
  const setMode = (mode: string) => patch({ mode });

  const live = site.mode === "auto" ? approved + suggested : approved;

  return (
    <div className="grid gap-4 md:grid-cols-2 md:auto-rows-fr">
      <div className="card flex h-full flex-col p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15.5px] font-medium">Add the script</h3>
          {site.firstPingAt ? (
            <span className="chip border-good/40 text-good">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              Live since {new Date(site.firstPingAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-faint" />
              Waiting for first visit
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Paste this before the closing body tag on every page. It is about 2 KB, loads deferred, and injects links
          while the browser is idle. It only wraps text that is already on the page.
        </p>
        <div className="mono relative mt-4 rounded-lg border border-line bg-ink p-4 text-[13px] text-muted break-all">
          {snippet}
          <button onClick={copy} className="btn btn-ghost btn-sm absolute right-2.5 top-2.5 bg-panel">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-xs text-faint">
          Single page app? Add <span className="mono text-muted">data-spa=&quot;true&quot;</span> and links refresh on
          route changes.
        </p>
      </div>

      <div className="card flex h-full flex-col p-6">
        <h3 className="text-[15.5px] font-medium">Serving mode</h3>
        <p className="mt-1 text-sm text-muted">
          Right now <span className="num font-medium text-body">{live}</span> link{live === 1 ? "" : "s"} would go live
          on your site.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={site.mode === "approved"}
            title="Approved only"
            body="Only links you approved are served. Safest choice."
            onClick={() => setMode("approved")}
          />
          <ModeCard
            active={site.mode === "auto"}
            title="Autopilot"
            body="Suggested links go live right away. You can still reject any."
            onClick={() => setMode("auto")}
          />
        </div>
      </div>

      <div className="card flex h-full flex-col p-6">
        <h3 className="text-[15.5px] font-medium">Automation</h3>
        <p className="mt-1 text-sm text-muted">
          Keep the map fresh without touching this dashboard. New posts get linked to and from on every refresh, and
          your approvals and rejections always carry over.
        </p>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Auto refresh</p>
              <p className="text-xs text-muted">
                Re-crawl on a schedule.
                {site.lastCrawlAt ? ` Last crawl ${new Date(site.lastCrawlAt).toLocaleString()}.` : ""}
              </p>
            </div>
            <button
              onClick={() => patch({ autoRefresh: !site.autoRefresh })}
              className={`relative h-[22px] w-10 rounded-full transition-colors ${
                site.autoRefresh ? "bg-accent" : "bg-line2"
              }`}
              aria-label="Toggle auto refresh"
            >
              <span
                className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${
                  site.autoRefresh ? "left-[22px] bg-ink" : "left-[3px] bg-muted"
                }`}
              />
            </button>
          </div>
          {site.autoRefresh === 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Refresh every</p>
              <div className="flex gap-1.5">
                {REFRESH_OPTIONS.map((o) => {
                  const locked = PLAN_RANK[plan] < PLAN_RANK[o.minPlan];
                  const active = site.refreshHours === o.hours;
                  return (
                    <button
                      key={o.hours}
                      onClick={() => !locked && patch({ refreshHours: o.hours })}
                      disabled={locked}
                      title={locked ? `Needs the ${o.minPlan} plan` : undefined}
                      className={`chip transition-colors ${
                        active
                          ? "border-line2 bg-panel2 text-body"
                          : locked
                            ? "cursor-not-allowed opacity-50"
                            : "hover:border-line2 hover:text-body"
                      }`}
                    >
                      {locked && (
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7m-8 0h9v6h-9V7Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Max new links per page</p>
              <p className="text-xs text-muted">Long pages earn more, short pages always get fewer.</p>
            </div>
            <div className="flex gap-1.5">
              {[3, 6, 10, 15].map((n) => (
                <button
                  key={n}
                  onClick={() => patch({ maxLinksPerPage: n })}
                  className={`chip num transition-colors ${
                    site.maxLinksPerPage === n ? "border-line2 bg-panel2 text-body" : "hover:border-line2 hover:text-body"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card flex h-full flex-col p-6">
        <h3 className="text-[15.5px] font-medium">Prefer server side?</h3>
        <p className="mt-1 text-sm text-muted">
          Fetch the full map as JSON and apply links in your templates or CMS. Same rules, zero client JS.
        </p>
        <div className="mono mt-3 rounded-lg border border-line bg-ink p-4 text-[13px] text-muted break-all">
          GET {origin}/api/map/{site.publicKey}
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card card-hover p-4 text-left transition-colors ${active ? "border-line2 bg-panel2" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3.5 w-3.5 rounded-full border ${active ? "border-accent bg-accent" : "border-line2"}`} />
        <span className="font-medium">{title}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{body}</p>
    </button>
  );
}
