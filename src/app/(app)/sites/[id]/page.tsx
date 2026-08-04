"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Site {
  id: number;
  url: string;
  host: string;
  name: string;
  publicKey: string;
  status: string;
  error: string | null;
  mode: string;
  pagesFound: number;
  sections: string;
  excluded: string;
  firstPingAt: number | null;
  lastPingAt: number | null;
  autoRefresh: number;
  refreshHours: number;
  maxLinksPerPage: number;
  lastCrawlAt: number | null;
}
interface Section {
  prefix: string;
  count: number;
  samples: string[];
}
interface PageRow {
  id: number;
  url: string;
  path: string;
  title: string;
  wordCount: number;
  depth: number | null;
  inDegree: number;
  outDegree: number;
  isOrphan: number;
  clusterId: number | null;
}
interface ClusterRow {
  id: number;
  label: string;
  terms: string[];
  size: number;
}
interface Opp {
  id: number;
  fromPageId: number;
  toPageId: number;
  anchor: string;
  sentence: string;
  score: number;
  source: string;
  reason: string;
  status: string;
}
interface SiteData {
  site: Site;
  plan: "free" | "starter" | "pro";
  pages: PageRow[];
  clusters: ClusterRow[];
  opportunities: Opp[];
  existingLinkCount: number;
}

type Tab = "opportunities" | "pages" | "clusters" | "performance" | "install";

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  opportunities: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8.5 11.5 11.5 8.5M9 6l1.4-1.4a3.25 3.25 0 0 1 4.6 4.6L13.6 10.6M11 14l-1.4 1.4a3.25 3.25 0 0 1-4.6-4.6L6.4 9.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  pages: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Zm0 0v4h4M7.5 10h5m-5 3h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clusters: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6" cy="6" r="2.5" /><circle cx="14" cy="6" r="2.5" /><circle cx="6" cy="14" r="2.5" /><circle cx="14" cy="14" r="2.5" />
    </svg>
  ),
  performance: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 16.5V13m4.5 3.5V9M12 16.5V11m4.5 5.5V5.5" strokeLinecap="round" />
    </svg>
  ),
  install: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m7 7-3.5 3L7 13m6-6 3.5 3L13 13m-1.5-8-3 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// Sections that almost never deserve internal links. Pre-excluded, one click
// to bring back.
const JUNK_SEGMENTS = new Set([
  "tag", "tags", "author", "authors", "search", "cart", "checkout", "account",
  "login", "register", "feed", "privacy", "privacy-policy", "terms",
  "terms-of-service", "terms-and-conditions", "cookie-policy", "cookies",
  "legal", "disclaimer", "thank-you", "wp-json", "wp-content",
]);

function isJunkSection(prefix: string): boolean {
  return prefix.split("/").filter(Boolean).some((seg) => JUNK_SEGMENTS.has(seg.toLowerCase()));
}

export default function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<SiteData | null>(null);
  const [tab, setTab] = useState<Tab>("opportunities");

  const load = useCallback(async () => {
    const res = await fetch(`/api/sites/${id}`);
    if (res.status === 404) {
      router.push("/dashboard");
      return;
    }
    if (res.ok) setData(await res.json());
  }, [id, router]);

  // Poll for as long as the page is open. Every state change (discovery
  // finishing, crawl progress, analysis completing, autopilot re-crawls)
  // shows up on its own within two seconds, no manual refresh ever.
  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const status = data?.site.status;

  if (!data) {
    return <div className="pt-24 text-center text-faint text-sm">Loading...</div>;
  }

  const { site, plan, pages, clusters, opportunities, existingLinkCount } = data;
  const working = status === "queued" || status === "crawling" || status === "analyzing";
  const suggested = opportunities.filter((o) => o.status === "suggested").length;
  const approved = opportunities.filter((o) => o.status === "approved").length;
  const orphans = pages.filter((p) => p.isOrphan).length;
  const pageById = new Map(pages.map((p) => [p.id, p]));

  async function recrawl() {
    fetch(`/api/sites/${id}/crawl`, { method: "POST" });
    setTimeout(load, 900);
  }
  async function removeSite() {
    if (!confirm(`Remove ${site.name} and all its data?`)) return;
    await fetch(`/api/sites/${id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  return (
    <div className="pt-8">
      <div className="mb-1 flex items-center gap-2 text-[13px] text-faint">
        <Link href="/dashboard" className="hover:text-muted transition-colors">
          Sites
        </Link>
        <span>/</span>
        <span className="text-muted">{site.name}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{site.name}</h1>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-xs text-faint hover:text-muted transition-colors"
          >
            {site.url}
          </a>
        </div>
        <div className="flex items-center gap-2">
          {status === "ready" && (
            <button onClick={recrawl} className="btn btn-ghost btn-sm">
              Re-crawl
            </button>
          )}
          <button onClick={removeSite} className="btn btn-ghost btn-sm hover:text-bad hover:border-bad/40">
            Remove
          </button>
        </div>
      </div>

      {status !== "ready" && <Stepper status={status ?? "new"} />}

      {status === "new" && <SectionsSetup site={site} reload={load} />}

      {working && <Progress status={status!} pagesFound={site.pagesFound} />}

      {status === "error" && (
        <div className="card mt-8 border-bad/30 p-5">
          <p className="font-medium text-bad">Crawl failed</p>
          <p className="mt-1 text-sm text-muted">{site.error}</p>
          <button onClick={recrawl} className="btn btn-primary btn-sm mt-4">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          {!site.firstPingAt && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <svg viewBox="0 0 20 20" className="h-4.5 w-4.5 h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M10 6.5v4.5m0 3v.01M10 2.5 2 16h16L10 2.5Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium">Your links are not live yet</p>
                  <p className="text-xs text-muted">
                    Add the script to {site.host} and approved links start appearing on your pages.
                  </p>
                </div>
              </div>
              <button onClick={() => setTab("install")} className="btn btn-primary btn-sm">
                Get the script
              </button>
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <BigStat label="Pages" value={pages.length} />
            <BigStat label="In-text links" value={existingLinkCount} />
            <BigStat label="Orphan pages" value={orphans} tone={orphans > 0 ? "warn" : undefined} />
            <BigStat label="Suggested" value={suggested} tone="accent" />
            <BigStat label="Approved" value={approved} tone="good" />
          </div>

          <div className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
            {(
              [
                ["opportunities", `Opportunities${suggested ? ` (${suggested})` : ""}`],
                ["pages", "Pages"],
                ["clusters", `Clusters (${clusters.length})`],
                ["performance", "Performance"],
                ["install", "Install"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors border-b -mb-px ${
                  tab === key ? "border-accent text-body" : "border-transparent text-faint hover:text-muted"
                }`}
              >
                {TAB_ICONS[key]}
                {label}
              </button>
            ))}
          </div>

          <div className="pt-6">
            {tab === "opportunities" && (
              <Opportunities site={site} opps={opportunities} pageById={pageById} reload={load} />
            )}
            {tab === "pages" && <PagesTable pages={pages} clusters={clusters} />}
            {tab === "clusters" && <Clusters clusters={clusters} pages={pages} />}
            {tab === "performance" && <Performance siteId={site.id} />}
            {tab === "install" && (
              <Install site={site} plan={plan} reload={load} approved={approved} suggested={suggested} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------- onboarding ------------------------------ */

function Stepper({ status }: { status: string }) {
  const step = status === "new" ? 1 : 2;
  const steps = ["Add site", "Choose sections", "Analyze"];
  return (
    <div className="mt-8 flex items-center gap-3">
      {steps.map((label, i) => {
        const state = i < step ? "done" : i === step ? "active" : "todo";
        return (
          <div key={label} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`num flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                  state === "done"
                    ? "bg-accent text-ink"
                    : state === "active"
                      ? "border border-body text-body"
                      : "border border-line2 text-faint"
                }`}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={`text-[13px] ${state === "todo" ? "text-faint" : "text-body"}`}>{label}</span>
            </div>
            {i < steps.length - 1 && <span className="h-px w-8 bg-line2" />}
          </div>
        );
      })}
    </div>
  );
}

function SectionsSetup({ site, reload }: { site: Site; reload: () => void }) {
  const initial = useMemo(() => {
    try {
      const parsed = JSON.parse(site.sections) as Section[];
      return parsed.length ? parsed : null;
    } catch {
      return null;
    }
  }, [site.sections]);

  const [sections, setSections] = useState<Section[] | null>(initial);
  const [excluded, setExcluded] = useState<Set<string>>(
    () => new Set(initial ? initial.filter((s) => isJunkSection(s.prefix)).map((s) => s.prefix) : []),
  );
  const [starting, setStarting] = useState(false);
  const [autopilot, setAutopilot] = useState(true);
  const discovering = useRef(false);

  useEffect(() => {
    if (sections || discovering.current) return;
    discovering.current = true;
    fetch(`/api/sites/${site.id}/discover`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.sections) {
          setSections(d.sections);
          setExcluded(new Set((d.sections as Section[]).filter((s) => isJunkSection(s.prefix)).map((s) => s.prefix)));
        }
      });
  }, [sections, site.id]);

  function toggle(prefix: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  }

  function start() {
    if (starting) return;
    setStarting(true);
    fetch(`/api/sites/${site.id}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excluded: [...excluded], autopilot }),
    });
    setTimeout(reload, 900);
  }

  if (!sections) {
    return (
      <div className="card mt-6 flex items-center gap-4 p-5">
        <Spinner />
        <div>
          <p className="font-medium text-[15px]">Scanning site structure...</p>
          <p className="text-sm text-muted">Reading the sitemap. This takes a few seconds.</p>
        </div>
      </div>
    );
  }

  const included = sections.filter((s) => !excluded.has(s.prefix));
  const includedPages = included.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-medium text-[15px]">Choose what gets linked</h2>
          <p className="mt-0.5 text-sm text-muted">
            Uncheck sections that should stay out of the link map. Junk sections are already off.
          </p>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {sections.map((s) => {
            const off = excluded.has(s.prefix);
            return (
              <button
                key={s.prefix}
                onClick={() => toggle(s.prefix)}
                className={`flex w-full items-center gap-3 border-b border-line/60 px-5 py-3 text-left transition-colors last:border-0 hover:bg-panel2 ${
                  off ? "opacity-45" : ""
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    off ? "border-line2" : "border-accent bg-accent"
                  }`}
                >
                  {!off && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="mono flex-1 truncate text-[13px]" title={s.samples.join("\n")}>
                  {s.prefix === "/" ? "/ (top level pages)" : s.prefix}
                </span>
                <span className="num shrink-0 text-xs text-faint">
                  {s.count} page{s.count === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card p-5 lg:sticky lg:top-20">
        <h3 className="font-medium text-[15px]">Ready to analyze</h3>
        <p className="mt-1 text-sm text-muted">
          <span className="num font-medium text-body">{includedPages}</span> pages in{" "}
          <span className="num font-medium text-body">{included.length}</span> section{included.length === 1 ? "" : "s"}{" "}
          will go into the link map.
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <button onClick={() => setAutopilot((v) => !v)} className="flex w-full items-start gap-3 text-left">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                autopilot ? "border-accent bg-accent" : "border-line2"
              }`}
            >
              {autopilot && (
                <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">Autopilot</span>
              <span className="block text-xs text-muted">
                New links go live without approval, and the site re-crawls on a schedule so new posts get
                linked automatically. You can reject any link later.
              </span>
            </span>
          </button>
        </div>
        <button
          onClick={start}
          disabled={starting || included.length === 0}
          className="btn btn-primary mt-5 w-full justify-center"
        >
          {starting ? "Starting..." : "Start analysis"}
        </button>
      </div>
    </div>
  );
}

function Progress({ status, pagesFound }: { status: string; pagesFound: number }) {
  const steps = [
    {
      label: pagesFound > 0 ? `Crawling pages (${pagesFound} so far)` : "Crawling pages",
      state: status === "crawling" || status === "queued" ? "active" : "done",
    },
    {
      label: "Mapping topics and picking anchor text",
      state: status === "analyzing" ? "active" : "todo",
    },
    { label: "Building your link map", state: "todo" },
  ];
  return (
    <div className="card mt-6 p-5">
      <div className="space-y-3.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            {s.state === "done" ? (
              <span className="flex h-4.5 w-4.5 h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-ink">
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : s.state === "active" ? (
              <Spinner small />
            ) : (
              <span className="h-[18px] w-[18px] rounded-full border border-line2" />
            )}
            <span className={`text-sm ${s.state === "todo" ? "text-faint" : "text-body"}`}>{s.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-faint">Runs once per crawl. Bigger sites take a few minutes.</p>
    </div>
  );
}

/* ------------------------------- components ------------------------------ */

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg className={`${small ? "h-[18px] w-[18px]" : "h-6 w-6"} animate-spin text-muted`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function BigStat({ label, value, tone }: { label: string; value: number; tone?: "accent" | "good" | "warn" }) {
  const dot =
    tone === "accent" ? "bg-accent" : tone === "good" ? "bg-good" : tone === "warn" && value > 0 ? "bg-warn" : null;
  return (
    <div className="card p-4">
      <div className="num text-[22px] font-semibold">{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-faint">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
    </div>
  );
}

function Opportunities({
  site,
  opps,
  pageById,
  reload,
}: {
  site: Site;
  opps: Opp[];
  pageById: Map<number, PageRow>;
  reload: () => void;
}) {
  const siteId = site.id;
  const [filter, setFilter] = useState<"all" | "suggested" | "approved" | "rejected">("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // The default view shows everything: suggestions needing a decision come
  // first, live approved links next, rejected last. One click narrows down.
  const STATUS_ORDER: Record<string, number> = { suggested: 0, approved: 1, rejected: 2 };
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return opps
      .filter((o) => filter === "all" || o.status === filter)
      .filter((o) => {
        if (!q) return true;
        const from = pageById.get(o.fromPageId)?.path ?? "";
        const to = pageById.get(o.toPageId)?.path ?? "";
        return (o.anchor + from + to).toLowerCase().includes(q);
      })
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opps, filter, query, pageById]);

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
      body: JSON.stringify({ siteId, from: "suggested", status: "approved" }),
    });
    setBusy(false);
    reload();
  }

  const counts = {
    all: opps.length,
    suggested: opps.filter((o) => o.status === "suggested").length,
    approved: opps.filter((o) => o.status === "approved").length,
    rejected: opps.filter((o) => o.status === "rejected").length,
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

  const statusDot =
    opp.status === "approved" ? "bg-good" : opp.status === "rejected" ? "bg-bad" : "bg-accent";

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
              href={`${site.url}${from?.path ?? ""}#:~:text=${encodeURIComponent(match || opp.anchor)}`}
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

function PagesTable({ pages, clusters }: { pages: PageRow[]; clusters: ClusterRow[] }) {
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
                {p.isOrphan ? <span className="chip border-warn/40 text-warn">orphan</span> : <span className="num">{p.inDegree}</span>}
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

function Clusters({ clusters, pages }: { clusters: ClusterRow[]; pages: PageRow[] }) {
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

interface GscSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  days: number;
}
interface GscDaily {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
interface GscData {
  configured: boolean;
  connected?: boolean;
  property?: string | null;
  properties?: string[];
  firstPingAt?: number | null;
  daily?: GscDaily[];
  before?: GscSummary | null;
  after?: GscSummary | null;
}

function Performance({ siteId }: { siteId: number }) {
  const [data, setData] = useState<GscData | null>(null);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/gsc/data?siteId=${siteId}`);
    if (res.ok) setData(await res.json());
  }, [siteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function pickProperty(property: string) {
    await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gscProperty: property }),
    });
    setData(null);
    loadData();
  }

  if (!data) return <div className="card p-10 text-center text-sm text-faint">Loading search data...</div>;

  if (!data.configured) {
    return (
      <div className="card max-w-2xl p-6">
        <h3 className="text-[15.5px] font-medium">Google Search Console is not set up yet</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          To pull organic traffic data, this deployment needs Google OAuth credentials. Create an OAuth client in
          Google Cloud Console, add the callback URL, then set{" "}
          <span className="mono text-body">GOOGLE_CLIENT_ID</span> and{" "}
          <span className="mono text-body">GOOGLE_CLIENT_SECRET</span> in the environment.
        </p>
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className="card max-w-2xl p-8 text-center">
        <h3 className="text-[17px] font-medium">See what your internal links actually do</h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          Connect Google Search Console and LinkAgent compares clicks, impressions, CTR and position from before and
          after the script went live on your site.
        </p>
        <a href={`/api/gsc/connect?siteId=${siteId}`} className="btn btn-primary mt-5">
          Connect Search Console
        </a>
        <p className="mt-3 text-xs text-faint">Read-only access. You can revoke it any time in your Google account.</p>
      </div>
    );
  }

  if (!data.property) {
    return (
      <div className="card max-w-2xl overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-[15.5px] font-medium">Pick the Search Console property for this site</h3>
          <p className="mt-0.5 text-sm text-muted">No automatic match was found. Choose the right one.</p>
        </div>
        {(data.properties ?? []).map((p) => (
          <button
            key={p}
            onClick={() => pickProperty(p)}
            className="mono block w-full border-b border-line/60 px-5 py-3 text-left text-[13px] transition-colors last:border-0 hover:bg-panel2"
          >
            {p}
          </button>
        ))}
        {(data.properties ?? []).length === 0 && (
          <p className="px-5 py-6 text-sm text-muted">No properties found on this Google account.</p>
        )}
      </div>
    );
  }

  const daily = data.daily ?? [];
  const { before, after } = data;
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

  return (
    <div className="space-y-5">
      {before && after && after.days > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DeltaStat label="Clicks" value={after.clicks.toLocaleString()} delta={pct(after.clicks, before.clicks)} />
          <DeltaStat
            label="Impressions"
            value={after.impressions.toLocaleString()}
            delta={pct(after.impressions, before.impressions)}
          />
          <DeltaStat
            label="CTR"
            value={`${(after.ctr * 100).toFixed(1)}%`}
            delta={before.ctr > 0 ? (after.ctr - before.ctr) * 100 : null}
            unit="pp"
          />
          <DeltaStat
            label="Avg position"
            value={after.position.toFixed(1)}
            delta={before.position > 0 ? before.position - after.position : null}
            unit=""
            invert
          />
        </div>
      ) : (
        <div className="card px-5 py-4 text-sm text-muted">
          Search data is connected. The before and after comparison starts once the script is live on your site.
        </div>
      )}
      {before && after && after.days > 0 && (
        <p className="text-xs text-faint">
          Comparing {after.days} days since the script went live against the {before.days} days before it. Search
          Console data lags about two days.
        </p>
      )}

      <GscChart daily={daily} firstPingAt={data.firstPingAt ?? null} />

      <p className="mono text-xs text-faint">{data.property}</p>
    </div>
  );
}

function DeltaStat({
  label,
  value,
  delta,
  unit = "%",
  invert = false,
}: {
  label: string;
  value: string;
  delta: number | null;
  unit?: string;
  invert?: boolean;
}) {
  const good = delta !== null && delta > 0;
  return (
    <div className="card p-4">
      <div className="num text-[22px] font-semibold">{value}</div>
      <div className="mt-0.5 flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-faint">
        {label}
        {delta !== null && Math.abs(delta) >= 0.05 && (
          <span className={`num normal-case tracking-normal ${good ? "text-good" : "text-bad"}`}>
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
            {unit} {invert ? (good ? "better" : "worse") : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function GscChart({ daily, firstPingAt }: { daily: GscDaily[]; firstPingAt: number | null }) {
  if (daily.length < 2) {
    return <div className="card p-10 text-center text-sm text-muted">Not enough search data yet.</div>;
  }
  const W = 600;
  const H = 150;
  const maxClicks = Math.max(...daily.map((d) => d.clicks), 1);
  const x = (i: number) => (i / (daily.length - 1)) * W;
  const y = (clicks: number) => H - 12 - (clicks / maxClicks) * (H - 30);
  const points = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.clicks).toFixed(1)}`).join(" ");
  const splitDate = firstPingAt ? new Date(firstPingAt).toISOString().slice(0, 10) : null;
  const splitIndex = splitDate ? daily.findIndex((d) => d.date >= splitDate) : -1;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Daily clicks, last {daily.length} days</h3>
        {splitIndex >= 0 && (
          <span className="chip">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            script live
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" aria-hidden>
        <polyline
          points={`0,${H} ${points} ${W},${H}`}
          fill="rgba(132, 204, 22, 0.08)"
          stroke="none"
        />
        <polyline points={points} fill="none" stroke="#84cc16" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {splitIndex >= 0 && (
          <line
            x1={x(splitIndex)}
            y1="4"
            x2={x(splitIndex)}
            y2={H}
            stroke="#84cc16"
            strokeWidth="1"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
        <span>{daily[0].date}</span>
        <span>{daily[daily.length - 1].date}</span>
      </div>
    </div>
  );
}

const REFRESH_OPTIONS: { hours: number; label: string; minPlan: "free" | "starter" | "pro" }[] = [
  { hours: 24, label: "Daily", minPlan: "pro" },
  { hours: 168, label: "Weekly", minPlan: "starter" },
  { hours: 720, label: "Monthly", minPlan: "free" },
];
const PLAN_RANK = { free: 0, starter: 1, pro: 2 };

function Install({
  site,
  plan,
  reload,
  approved,
  suggested,
}: {
  site: Site;
  plan: "free" | "starter" | "pro";
  reload: () => void;
  approved: number;
  suggested: number;
}) {
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
              className={`relative h-5.5 w-10 h-[22px] rounded-full transition-colors ${
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
