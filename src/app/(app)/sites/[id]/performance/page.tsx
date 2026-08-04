"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
          Connect Google Search Console and Linkagent compares clicks, impressions, CTR and position from before and
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
      ) : data.firstPingAt ? (
        <div className="card px-5 py-4 text-sm text-muted">
          Your script went live on{" "}
          <span className="font-medium text-body">
            {new Date(data.firstPingAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
          </span>
          . Search Console data lags about two days, so the after picture starts filling in shortly. The go-live
          marker on the chart shows where your data ends today.
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

type Metric = "clicks" | "impressions" | "ctr" | "position";

const METRICS: { key: Metric; label: string }[] = [
  { key: "clicks", label: "Clicks" },
  { key: "impressions", label: "Impressions" },
  { key: "ctr", label: "CTR" },
  { key: "position", label: "Position" },
];
const RANGES = [
  { days: 28, label: "28d" },
  { days: 60, label: "60d" },
  { days: 90, label: "90d" },
  { days: 9999, label: "All" },
];

function fmtMetric(metric: Metric, v: number): string {
  if (metric === "ctr") return `${(v * 100).toFixed(1)}%`;
  if (metric === "position") return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

function GscChart({ daily: fullDaily, firstPingAt }: { daily: GscDaily[]; firstPingAt: number | null }) {
  const [metric, setMetric] = useState<Metric>("clicks");
  const [range, setRange] = useState(9999);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const daily = range >= fullDaily.length ? fullDaily : fullDaily.slice(-range);

  if (daily.length < 2) {
    return <div className="card p-10 text-center text-sm text-muted">Not enough search data yet.</div>;
  }

  const W = 600;
  const H = 170;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 16;

  const values = daily.map((d) => d[metric]);
  // Position charts read better inverted: ranking closer to #1 plots higher.
  const inverted = metric === "position";
  const rawMax = Math.max(...values, metric === "ctr" ? 0.01 : 1);
  const rawMin = inverted ? Math.min(...values) : 0;
  const span = Math.max(rawMax - rawMin, 1e-6);

  const x = (i: number) => (i / (daily.length - 1)) * W;
  const y = (v: number) => {
    const ratio = (v - rawMin) / span;
    const r = inverted ? 1 - ratio : ratio;
    return H - PAD_BOTTOM - r * (H - PAD_TOP - PAD_BOTTOM);
  };

  const points = daily.map((d, i) => `${x(i).toFixed(1)},${y(d[metric]).toFixed(1)}`).join(" ");
  const splitDate = firstPingAt ? new Date(firstPingAt).toISOString().slice(0, 10) : null;
  // Where the go-live marker sits. Search Console data lags about two days,
  // so a fresh install lands past the last data point; clamp it to the
  // right edge instead of hiding it.
  let splitIndex = -1;
  let splitPending = false;
  if (splitDate) {
    if (splitDate > daily[daily.length - 1].date) {
      splitIndex = daily.length - 1;
      splitPending = true;
    } else {
      splitIndex = daily.findIndex((d) => d.date >= splitDate);
    }
  }

  const gridLines = [0.25, 0.5, 0.75].map((r) => ({
    yPos: H - PAD_BOTTOM - r * (H - PAD_TOP - PAD_BOTTOM),
    value: inverted ? rawMax - r * span : rawMin + r * span,
  }));

  function indexFromEvent(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return Math.round(ratio * (daily.length - 1));
  }

  const hovered = hover !== null ? daily[hover] : null;
  const hoverLeftPct = hover !== null ? (hover / (daily.length - 1)) * 100 : 0;

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`chip transition-colors ${
                metric === m.key ? "border-line2 bg-panel2 text-body" : "hover:border-line2 hover:text-body"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`chip num transition-colors ${
                range === r.days ? "border-line2 bg-panel2 text-body" : "hover:border-line2 hover:text-body"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative cursor-crosshair select-none"
        onMouseMove={(e) => setHover(indexFromEvent(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(indexFromEvent(e.touches[0].clientX))}
        onTouchMove={(e) => setHover(indexFromEvent(e.touches[0].clientX))}
        onTouchEnd={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" aria-hidden>
          {gridLines.map((g) => (
            <line
              key={g.yPos}
              x1="0"
              y1={g.yPos}
              x2={W}
              y2={g.yPos}
              stroke="rgba(140,150,200,0.09)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* everything after the script went live sits on a lime wash, so
              the before/after divide reads instantly */}
          {splitIndex >= 0 && !splitPending && (
            <rect
              x={x(splitIndex)}
              y={0}
              width={W - x(splitIndex)}
              height={H - PAD_BOTTOM}
              fill="rgba(132, 204, 22, 0.06)"
            />
          )}
          {!inverted && (
            <polyline
              points={`0,${H - PAD_BOTTOM} ${points} ${W},${H - PAD_BOTTOM}`}
              fill="rgba(132, 204, 22, 0.08)"
              stroke="none"
            />
          )}
          <polyline points={points} fill="none" stroke="#84cc16" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          {splitIndex >= 0 && (
            <line
              x1={x(splitIndex)}
              y1={0}
              x2={x(splitIndex)}
              y2={H - PAD_BOTTOM}
              stroke="#84cc16"
              strokeWidth="1.6"
              strokeDasharray="5 3"
              opacity="0.9"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                y1={PAD_TOP - 6}
                x2={x(hover)}
                y2={H - PAD_BOTTOM}
                stroke="rgba(233,235,245,0.35)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={x(hover)} cy={y(daily[hover][metric])} r="3.5" fill="#84cc16" stroke="#09090b" strokeWidth="1.5" />
            </>
          )}
        </svg>

        {/* the exact go-live date, pinned to the marker line */}
        {splitIndex >= 0 && splitDate && (
          <div
            className="pointer-events-none absolute top-0 z-[5]"
            style={{
              left: `${(splitIndex / (daily.length - 1)) * 100}%`,
              transform: `translateX(${splitIndex / (daily.length - 1) > 0.7 ? "-100%" : "0%"}) translateY(-40%)`,
            }}
          >
            <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-ink shadow-lg">
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor">
                <path d="M6.7 1 2.5 7h2.8L5 11l4.5-6H6.6L6.7 1Z" />
              </svg>
              Script live ·{" "}
              {new Date(splitDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {splitPending ? " →" : ""}
            </span>
          </div>
        )}

        {/* y-axis labels overlaid so the svg can stretch freely */}
        <div className="pointer-events-none absolute inset-0">
          {gridLines.map((g) => (
            <span
              key={g.yPos}
              className="num absolute left-0 text-[9.5px] text-faint"
              style={{ top: `${(g.yPos / H) * 100}%`, transform: "translateY(-110%)" }}
            >
              {fmtMetric(metric, g.value)}
            </span>
          ))}
        </div>

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-y-1 rounded-lg border border-line2 bg-panel px-3 py-2 shadow-xl"
            style={{
              left: `${hoverLeftPct}%`,
              transform: `translateX(${hoverLeftPct > 65 ? "-105%" : "8px"})`,
            }}
          >
            <p className="num text-xs font-medium">{hovered.date}</p>
            <div className="mt-1 space-y-0.5 text-[11px] whitespace-nowrap">
              <p className={metric === "clicks" ? "text-accent" : "text-muted"}>
                Clicks <span className="num font-medium text-body">{hovered.clicks.toLocaleString()}</span>
              </p>
              <p className={metric === "impressions" ? "text-accent" : "text-muted"}>
                Impressions <span className="num font-medium text-body">{hovered.impressions.toLocaleString()}</span>
              </p>
              <p className={metric === "ctr" ? "text-accent" : "text-muted"}>
                CTR <span className="num font-medium text-body">{(hovered.ctr * 100).toFixed(1)}%</span>
              </p>
              <p className={metric === "position" ? "text-accent" : "text-muted"}>
                Position <span className="num font-medium text-body">{hovered.position.toFixed(1)}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
        <span className="num">{daily[0].date}</span>
        <span className="num">{daily[daily.length - 1].date}</span>
      </div>
    </div>
  );
}
