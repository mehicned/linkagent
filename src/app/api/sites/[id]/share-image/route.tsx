import { ImageResponse } from "next/og";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sites } from "@/lib/db";
import { requireUser, userOwnsSite } from "@/lib/session";
import { getAccessToken, queryDaily } from "@/lib/gsc";

export const maxDuration = 60;

// Renders the site's clicks curve with the go-live marker as a branded
// 1200x630 image, ready to post. Owner only.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const siteId = Number(id);
  if (!(await userOwnsSite(user.id, siteId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site?.gscProperty) return NextResponse.json({ error: "Connect Search Console first." }, { status: 400 });
  const token = await getAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "Connect Search Console first." }, { status: 400 });

  const end = Date.now() - 2 * 86400_000;
  const start = end - 90 * 86400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const daily = await queryDaily(token, site.gscProperty, iso(start), iso(end));
  if (daily.length < 2) return NextResponse.json({ error: "Not enough data yet." }, { status: 400 });

  const W = 1060;
  const H = 300;
  const maxClicks = Math.max(...daily.map((d) => d.clicks), 1);
  const x = (i: number) => (i / (daily.length - 1)) * W;
  const y = (v: number) => H - (v / maxClicks) * (H - 20);
  const points = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.clicks).toFixed(1)}`).join(" ");

  const splitDate = site.firstPingAt ? iso(site.firstPingAt) : null;
  let splitIndex = -1;
  if (splitDate) {
    splitIndex = splitDate > daily[daily.length - 1].date ? daily.length - 1 : daily.findIndex((d) => d.date >= splitDate);
  }

  let deltaText = "";
  if (splitIndex > 0 && splitIndex < daily.length - 1) {
    const after = daily.slice(splitIndex);
    const before = daily.slice(Math.max(0, splitIndex - after.length), splitIndex);
    const sum = (rows: typeof daily) => rows.reduce((s, r) => s + r.clicks, 0);
    const b = sum(before);
    const a = sum(after);
    if (b > 0) {
      const pct = ((a - b) / b) * 100;
      deltaText = `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% clicks since internal links went live`;
    }
  }
  if (!deltaText) deltaText = "Internal links on autopilot";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#09090b",
          padding: 70,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#f2f2f3", fontSize: 44, fontWeight: 700 }}>{site.host}</span>
            <span style={{ color: "#84cc16", fontSize: 30, fontWeight: 700, marginTop: 8 }}>{deltaText}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: "#84cc16", display: "flex" }} />
            <span style={{ color: "#9a9aa3", fontSize: 26, fontWeight: 600 }}>Linkagent</span>
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 40, position: "relative" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <polyline points={`0,${H} ${points} ${W},${H}`} fill="rgba(132,204,22,0.10)" stroke="none" />
            <polyline points={points} fill="none" stroke="#84cc16" strokeWidth="3" />
            {splitIndex >= 0 && (
              <line
                x1={x(splitIndex)}
                y1="0"
                x2={x(splitIndex)}
                y2={H}
                stroke="#84cc16"
                strokeWidth="2"
                strokeDasharray="8 6"
              />
            )}
          </svg>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <span style={{ color: "#61616b", fontSize: 22 }}>{daily[0].date}</span>
          <span style={{ color: "#61616b", fontSize: 22 }}>
            {splitDate ? `script live ${splitDate}` : ""}
          </span>
          <span style={{ color: "#61616b", fontSize: 22 }}>{daily[daily.length - 1].date}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
