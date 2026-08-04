import { pgTable, serial, text, integer, bigint, doublePrecision, index } from "drizzle-orm/pg-core";

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  // Owner. Null only for sites created before auth existed; the first
  // signed-in user claims those.
  userId: text("user_id"),
  url: text("url").notNull(),
  host: text("host").notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull().unique(),
  status: text("status").notNull().default("new"), // new | queued | crawling | analyzing | ready | error
  error: text("error"),
  mode: text("mode").notNull().default("approved"), // approved | auto
  sections: text("sections").notNull().default("[]"), // JSON [{prefix, count, samples}]
  excluded: text("excluded").notNull().default("[]"), // JSON string[] of section prefixes
  maxPages: integer("max_pages").notNull().default(200),
  pagesFound: integer("pages_found").notNull().default(0),
  // Continuous mode: re-crawl on a schedule so new posts get linked to and
  // from without anyone touching the dashboard.
  autoRefresh: integer("auto_refresh").notNull().default(0),
  refreshHours: integer("refresh_hours").notNull().default(24),
  maxLinksPerPage: integer("max_links_per_page").notNull().default(6),
  lastCrawlAt: bigint("last_crawl_at", { mode: "number" }),
  // Set the first time the embed script requests the map from the client's
  // own site. This is the anchor date for before and after SEO comparisons.
  firstPingAt: bigint("first_ping_at", { mode: "number" }),
  lastPingAt: bigint("last_ping_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id").notNull(),
    url: text("url").notNull(),
    path: text("path").notNull(),
    title: text("title").notNull().default(""),
    h1: text("h1").notNull().default(""),
    description: text("description").notNull().default(""),
    headings: text("headings").notNull().default("[]"), // JSON string[]
    text: text("text").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    depth: integer("depth"), // null = not reachable from home
    inDegree: integer("in_degree").notNull().default(0),
    outDegree: integer("out_degree").notNull().default(0),
    isOrphan: integer("is_orphan").notNull().default(0),
    clusterId: integer("cluster_id"),
  },
  (t) => [index("pages_site_idx").on(t.siteId)],
);

export const existingLinks = pgTable(
  "existing_links",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id").notNull(),
    fromPageId: integer("from_page_id").notNull(),
    toPageId: integer("to_page_id").notNull(),
    anchor: text("anchor").notNull().default(""),
  },
  (t) => [index("links_site_idx").on(t.siteId)],
);

export const clusters = pgTable(
  "clusters",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id").notNull(),
    label: text("label").notNull(),
    terms: text("terms").notNull().default("[]"),
    size: integer("size").notNull().default(0),
  },
  (t) => [index("clusters_site_idx").on(t.siteId)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id").notNull(),
    fromPageId: integer("from_page_id").notNull(),
    toPageId: integer("to_page_id").notNull(),
    anchor: text("anchor").notNull(),
    sentence: text("sentence").notNull().default(""),
    score: doublePrecision("score").notNull().default(0),
    source: text("source").notNull().default("heuristic"), // heuristic | ai
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("suggested"), // suggested | approved | rejected
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("opps_site_idx").on(t.siteId), index("opps_status_idx").on(t.siteId, t.status)],
);

// Anonymous teaser scans from the landing page. Claimed into a real site
// after signup.
export const freeScans = pgTable("free_scans", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  url: text("url").notNull(),
  host: text("host").notNull(),
  totalUrls: integer("total_urls").notNull().default(0),
  pagesScanned: integer("pages_scanned").notNull().default(0),
  oppCount: integer("opp_count").notNull().default(0),
  sections: text("sections").notNull().default("[]"),
  samples: text("samples").notNull().default("[]"), // JSON [{from,to,anchor}]
  claimedSiteId: integer("claimed_site_id"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export type Site = typeof sites.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
