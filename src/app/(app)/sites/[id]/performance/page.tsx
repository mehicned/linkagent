"use client";

import { useCallback, useEffect, useState } from "react";
import { useSiteData } from "../site-shared";

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

export default function PerformancePage() {
  const { data: siteData } = useSiteData();
  const siteId = siteData.site.id;
  const [data, setData] = useState<GscData | null>(null);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`/api/gsc/data?siteId=${siteId}`);
      if (res.ok) setData(await res.json());
      else setError(true);
    } catch {
      setError(true);
    }
  }, [siteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (error) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-muted">Could not load search data.</p>
        <button onClick={loadData} className="btn btn-ghost btn-sm mt-3">
          Try again
        </button>
      </div>
    );
  }

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
      <div className="card p-6">
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
      <div className="card p-10 text-center">
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
      <div className="card overflow-hidden">
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
        <polyline points={`0,${H} ${points} ${W},${H}`} fill="rgba(132, 204, 22, 0.08)" stroke="none" />
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
