"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

      {sites === null ? (
        <p className="mt-16 text-center text-sm text-faint">Loading...</p>
      ) : sites.length === 0 ? (
        <div className="card mt-10 p-12 text-center">
          <h2 className="text-[17px] font-medium">Add your first site</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            Paste a URL above. LinkAgent scans the structure first, and you pick which sections get
            linked before the full crawl runs.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <Link key={s.id} href={`/sites/${s.id}`} className="card card-hover block p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-[15px] truncate">{s.name}</span>
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
