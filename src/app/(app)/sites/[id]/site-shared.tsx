"use client";

import { createContext, useContext } from "react";

export interface Site {
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
export interface Section {
  prefix: string;
  count: number;
  samples: string[];
}
export interface PageRow {
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
export interface ClusterRow {
  id: number;
  label: string;
  terms: string[];
  size: number;
}
export interface Opp {
  id: number;
  fromPageId: number;
  toPageId: number;
  anchor: string;
  sentence: string;
  score: number;
  source: string;
  reason: string;
  status: string;
  clicks: number;
}
export interface SiteData {
  site: Site;
  plan: "free" | "starter" | "pro";
  pages: PageRow[];
  clusters: ClusterRow[];
  opportunities: Opp[];
  existingLinkCount: number;
  clicksTotal: number;
}

// The site layout owns fetching and polling; sub-pages consume this.
export const SiteContext = createContext<{ data: SiteData; reload: () => void } | null>(null);

export function useSiteData() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteData must be used inside the site layout");
  return ctx;
}

// Sections that almost never deserve internal links. Pre-excluded, one
// click to bring back. Mirrored in src/lib/crawler.ts.
export const JUNK_SEGMENTS = new Set([
  "tag", "tags", "author", "authors", "search", "cart", "checkout", "account",
  "login", "register", "feed", "privacy", "privacy-policy", "terms",
  "terms-of-service", "terms-and-conditions", "cookie-policy", "cookies",
  "legal", "disclaimer", "thank-you", "wp-json", "wp-content",
]);

export function isJunkSection(prefix: string): boolean {
  return prefix.split("/").filter(Boolean).some((seg) => JUNK_SEGMENTS.has(seg.toLowerCase()));
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <svg
      className={`${small ? "h-[18px] w-[18px]" : "h-6 w-6"} animate-spin text-muted`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
