"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Favicon } from "@/components/Sidebar";

interface SiteRow {
  id: number;
  url: string;
  host: string;
  name: string;
  status: string;
  pagesFound: number;
  pages: number;
  suggested: number;
  approved: number;
  createdAt: number;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Setup",
  queued: "Queued",
  crawling: "Crawling",
  analyzing: "Analyzing",
  ready: "Ready",
  error: "Error",
};

export default function DashboardPage() {
  const router = useRouter();
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/sites");
    if (res.ok) setSites(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push(`/sites/${data.id}`);
  }

  return (
    <div className="pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">All your sites and their link maps in one place.</p>
        </div>
        <form onSubmit={addSite} className="flex w-full max-w-md gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Add a site: yoursite.com"
            className="card flex-1 rounded-lg px-3.5 py-2.5 text-sm outline-none placeholder:text-faint focus:border-line2"
            spellCheck={false}
          />
          <button type="submit" disabled={busy || !url.trim()} className="btn btn-primary">
            {busy ? "Adding..." : "Analyze"}
          </button>
        </form>
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <ProspectScanner />

      {sites === null ? (
        <p className="mt-16 text-center text-sm text-faint">Loading...</p>
      ) : sites.length === 0 ? (
        <div className="card mt-10 p-12 text-center">
          <h2 className="text-[17px] font-medium">Add your first site</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            Paste a URL above. Linkagent scans the structure first, and you pick which sections get
            linked before the full crawl runs.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Link key={s.id} href={`/sites/${s.id}`} className="card card-hover block p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Favicon host={s.host} className="h-5 w-5" />
                  <span className="font-medium text-[15px] truncate">{s.name}</span>
                </span>
                <StatusChip status={s.status} />
              </div>
              <p className="mt-0.5 text-xs text-faint truncate mono">{s.url}</p>
              <div className="mt-5 flex gap-6">
                <Stat label="Pages" value={s.status === "crawling" ? s.pagesFound : s.pages} />
                <Stat label="Suggested" value={s.suggested} />
                <Stat label="Approved" value={s.approved} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface RecentScan {
  token: string;
  host: string;
  oppCount: number;
  pagesScanned: number;
  totalUrls: number;
  createdAt: number;
}

// Generate a shareable scan report for any site, without adding it to your
// dashboard. Built for outreach: scan a prospect, send them the link.
// Past reports stay listed here, so nothing is ever scanned twice.
function ProspectScanner() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ token: string; host: string; oppCount: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [showAll, setShowAll] = useState(false);

  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/scan/recent");
    if (res.ok) setRecent(await res.json());
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Scan failed.");
      else {
        setReport({ token: data.token, host: data.host, oppCount: data.oppCount });
        loadRecent();
      }
    } catch {
      setError("Scan failed. Try again.");
    }
    setBusy(false);
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/scan/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="card mt-8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-medium">Scan any site, share the report</h2>
          <p className="mt-0.5 text-sm text-muted">
            Runs the free teaser scan on any domain and gives you a shareable report link. The site is not added to
            your dashboard.
          </p>
        </div>
        <form onSubmit={scan} className="flex w-full max-w-md gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="prospect-site.com"
            className="card flex-1 rounded-lg px-3.5 py-2 text-sm outline-none placeholder:text-faint focus:border-line2"
            spellCheck={false}
          />
          <button type="submit" disabled={busy || !url.trim()} className="btn btn-ghost">
            {busy ? "Scanning..." : "Scan"}
          </button>
        </form>
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      {report && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
          <p className="text-sm">
            <span className="num font-semibold text-accent">{report.oppCount}</span>{" "}
            <span className="text-muted">missing links found on</span>{" "}
            <span className="font-medium">{report.host}</span>
          </p>
          <div className="flex items-center gap-2">
            <a href={`/scan/${report.token}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              View report
            </a>
            <button onClick={() => copyLink(report.token)} className="btn btn-primary btn-sm">
              {copied === report.token ? "Link copied" : "Copy share link"}
            </button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">Your reports</p>
          <div className="divide-y divide-line/60 rounded-lg border border-line">
            {(showAll ? recent : recent.slice(0, 5)).map((s) => (
              <div key={s.token} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3 text-sm">
                  <span className="truncate font-medium">{s.host}</span>
                  <span className="num shrink-0 text-xs text-muted">{s.oppCount} links</span>
                  <span className="num shrink-0 text-xs text-faint">
                    {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={`/scan/${s.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    View
                  </a>
                  <button onClick={() => copyLink(s.token)} className="btn btn-ghost btn-sm">
                    {copied === s.token ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {recent.length > 5 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-faint hover:text-muted">
              {showAll ? "Show fewer" : `Show all ${recent.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="num text-lg font-semibold">{value}</div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const dot: Record<string, string> = {
    new: "bg-warn",
    ready: "bg-good",
    error: "bg-bad",
    crawling: "bg-accent pulse",
    analyzing: "bg-accent pulse",
    queued: "bg-faint",
  };
  return (
    <span className="chip">
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status] ?? "bg-faint"}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
