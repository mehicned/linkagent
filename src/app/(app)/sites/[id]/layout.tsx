"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteContext, Spinner, isJunkSection, type Site, type Section, type SiteData } from "./site-shared";

export default function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<SiteData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sites/${id}`);
    if (res.status === 404) {
      router.push("/dashboard");
      return;
    }
    if (res.ok) setData(await res.json());
  }, [id, router]);

  // Poll for as long as any site page is open. Every state change
  // (discovery finishing, crawl progress, analysis completing, autopilot
  // re-crawls, the script going live) shows up on its own within seconds.
  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const status = data?.site.status;

  if (!data) {
    return <div className="pt-24 text-center text-faint text-sm">Loading...</div>;
  }

  const { site, pages, opportunities, existingLinkCount, clicksTotal } = data;
  const working = status === "queued" || status === "crawling" || status === "analyzing";
  const suggested = opportunities.filter((o) => o.status === "suggested").length;
  const approved = opportunities.filter((o) => o.status === "approved").length;
  const orphans = pages.filter((p) => p.isOrphan).length;

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
          {status === "ready" && <ShareReportButton siteId={site.id} />}
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
        <SiteContext.Provider value={{ data, reload: load }}>
          {!site.firstPingAt && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
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
              <Link href={`/sites/${site.id}/install`} className="btn btn-primary btn-sm">
                Get the script
              </Link>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
            <BigStat label="Pages" value={pages.length} />
            <BigStat label="In-text links" value={existingLinkCount} />
            <BigStat label="Orphan pages" value={orphans} tone={orphans > 0 ? "warn" : undefined} />
            <BigStat label="Suggested" value={suggested} tone="accent" />
            <BigStat label="Approved" value={approved} tone="good" />
            <BigStat label="Clicks · 30d" value={clicksTotal} tone={clicksTotal > 0 ? "good" : undefined} />
          </div>

          <div className="pt-6">{children}</div>
        </SiteContext.Provider>
      )}
    </div>
  );
}

// Creates or refreshes the site's shareable report and copies the link.
function ShareReportButton({ siteId }: { siteId: number }) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");
  return (
    <button
      onClick={async () => {
        if (state === "busy") return;
        setState("busy");
        try {
          const res = await fetch(`/api/sites/${siteId}/share-report`, { method: "POST" });
          const data = await res.json();
          if (res.ok) {
            await navigator.clipboard.writeText(`${window.location.origin}/scan/${data.token}`);
            setState("copied");
            setTimeout(() => setState("idle"), 1800);
            return;
          }
        } catch {
          /* fall through */
        }
        setState("idle");
      }}
      className="btn btn-ghost btn-sm"
      title="Copy a shareable report link for this site"
    >
      {state === "copied" ? "Link copied" : state === "busy" ? "..." : "Share report"}
    </button>
  );
}

/* -------------------------------- pre-ready ------------------------------- */

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
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-ink">
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
