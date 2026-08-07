import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db, freeScans } from "@/lib/db";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [scan] = await db.select().from(freeScans).where(eq(freeScans.token, token)).limit(1);
  const host = scan?.host ?? "your site";
  const count = scan?.oppCount ?? 0;
  const pagesScanned = scan?.pagesScanned ?? 0;
  const density = count / Math.max(pagesScanned, 1);
  const score = Math.round(Math.min(95, Math.max(20, 95 - density * 25)));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const gradeColor = score >= 75 ? "#a3e635" : score >= 55 ? "#e8c468" : "#ef8a8a";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#09090b",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: "#84cc16", display: "flex" }} />
          <span style={{ color: "#f2f2f3", fontSize: 30, fontWeight: 700 }}>Linkagent</span>
          <span style={{ color: "#61616b", fontSize: 26, marginLeft: 8 }}>internal linking report</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 800 }}>
            <span style={{ color: "#f2f2f3", fontSize: 62, fontWeight: 700 }}>{host}</span>
            <span style={{ color: "#84cc16", fontSize: 44, fontWeight: 700, marginTop: 22 }}>
              {count} missing internal links
            </span>
            <span style={{ color: "#9a9aa3", fontSize: 27, marginTop: 10 }}>
              found in just the first {pagesScanned} pages scanned
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 190,
              height: 190,
              borderRadius: 999,
              border: `6px solid ${gradeColor}`,
            }}
          >
            <span style={{ color: gradeColor, fontSize: 92, fontWeight: 700, lineHeight: 1 }}>{grade}</span>
            <span style={{ color: "#61616b", fontSize: 24 }}>{score}/100</span>
          </div>
        </div>

        <span style={{ color: "#61616b", fontSize: 24 }}>Open source · scan any site free</span>
      </div>
    ),
    size,
  );
}
