import { extractPage, normalizeUrl, stripWww, type ExtractedPage } from "./extract";

export interface CrawledPage extends ExtractedPage {
  url: string;
  path: string;
}

const UA = "LinkAgentBot/0.1 (+https://github.com/linkagent/linkagent; internal linking analysis)";
const FETCH_TIMEOUT = 12000;
const CONCURRENCY = 6;

async function fetchText(url: string, accept: string): Promise<{ text: string; contentType: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    return { text, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// robots.txt handling with real wildcard support. Patterns like /*?* and
// /*.json$ are common, and treating them as prefix rules would wrongly
// block entire sites. Allow and Disallow compete by specificity, the way
// Google resolves them.
function robotsRuleToRegex(rule: string): RegExp {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

async function loadRobots(origin: string): Promise<(pathAndQuery: string) => boolean> {
  const res = await fetchText(`${origin}/robots.txt`, "text/plain");
  if (!res) return () => true;
  const rules: { allow: boolean; regex: RegExp; specificity: number }[] = [];
  let applies = false;
  for (const raw of res.text.split("\n")) {
    const line = raw.split("#")[0].trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      applies = value === "*" || /linkagent/i.test(value);
    } else if (applies && (key === "disallow" || key === "allow") && value) {
      try {
        rules.push({ allow: key === "allow", regex: robotsRuleToRegex(value), specificity: value.length });
      } catch {
        /* skip malformed patterns */
      }
    }
  }
  return (pathAndQuery: string) => {
    let best: { allow: boolean; specificity: number } | null = null;
    for (const r of rules) {
      if (r.regex.test(pathAndQuery) && (!best || r.specificity > best.specificity)) best = r;
    }
    return !best || best.allow;
  };
}

async function loadSitemap(origin: string, depth = 0): Promise<string[]> {
  if (depth > 1) return [];
  const candidates = depth === 0 ? [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`] : [];
  const urls: string[] = [];
  for (const candidate of candidates) {
    const found = await readSitemapFile(candidate, origin, depth);
    urls.push(...found);
    if (urls.length) break;
  }
  return urls;
}

async function readSitemapFile(url: string, origin: string, depth: number): Promise<string[]> {
  const res = await fetchText(url, "application/xml,text/xml");
  if (!res) return [];
  const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));
  if (/<sitemapindex/i.test(res.text)) {
    const nested: string[] = [];
    for (const loc of locs.slice(0, 20)) {
      if (depth >= 2) break;
      nested.push(...(await readSitemapFile(loc, origin, depth + 1)));
    }
    return nested;
  }
  return locs;
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export interface SiteSection {
  prefix: string; // "/" for top level pages, else "/blog" or "/companies/regions"
  count: number;
  samples: string[];
}

// Fast structure scan before any real crawling: sitemap first, homepage links
// as a fallback. Groups URLs into sections the user can include or exclude.
export async function discoverStructure(startUrl: string): Promise<{ total: number; sections: SiteSection[] }> {
  const start = new URL(startUrl);
  const origin = start.origin;
  const host = stripWww(start.hostname);

  let urls = await loadSitemap(origin);
  if (!urls.length) {
    const res = await fetchText(origin + "/", "text/html,application/xhtml+xml");
    if (res) {
      try {
        const page = extractPage(res.text, origin + "/");
        urls = page.links.map((l) => l.href);
      } catch {
        /* fall through with what we have */
      }
    }
  }

  const paths = new Set<string>();
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      if (stripWww(parsed.hostname) !== host) continue;
      paths.add(parsed.pathname.replace(/\/+$/, "") || "/");
    } catch {
      /* skip */
    }
  }

  return { total: paths.size, sections: groupSections([...paths]) };
}

function groupSections(paths: string[]): SiteSection[] {
  const byFirst = new Map<string, string[]>();
  for (const p of paths) {
    const segs = p.split("/").filter(Boolean);
    const key = segs.length === 0 ? "/" : `/${segs[0]}`;
    if (!byFirst.has(key)) byFirst.set(key, []);
    byFirst.get(key)!.push(p);
  }

  const sections: SiteSection[] = [];
  for (const [key, list] of byFirst) {
    // Big first-level groups get split one level deeper when that reveals
    // real subsections (like /companies/regions inside /companies).
    if (key !== "/" && list.length >= 8) {
      const bySecond = new Map<string, string[]>();
      const rest: string[] = [];
      for (const p of list) {
        const segs = p.split("/").filter(Boolean);
        if (segs.length >= 3) {
          const k2 = `${key}/${segs[1]}`;
          if (!bySecond.has(k2)) bySecond.set(k2, []);
          bySecond.get(k2)!.push(p);
        } else {
          rest.push(p);
        }
      }
      let split = false;
      for (const [k2, l2] of bySecond) {
        if (l2.length >= 3) {
          sections.push({ prefix: k2, count: l2.length, samples: l2.slice(0, 3) });
          split = true;
        } else {
          rest.push(...l2);
        }
      }
      if (rest.length) sections.push({ prefix: key, count: rest.length, samples: rest.slice(0, 3) });
      if (!split && !rest.length) sections.push({ prefix: key, count: list.length, samples: list.slice(0, 3) });
    } else {
      sections.push({ prefix: key, count: list.length, samples: list.slice(0, 3) });
    }
  }
  return sections.sort((a, b) => b.count - a.count);
}

// Sections that never deserve internal link equity. A page in one of these
// only survives the crawl if the user saw it as a section during setup and
// deliberately kept it. Mirrors the list in the setup UI.
const JUNK_SEGMENTS = new Set([
  "tag", "tags", "author", "authors", "search", "cart", "checkout", "account",
  "login", "register", "feed", "privacy", "privacy-policy", "terms",
  "terms-of-service", "terms-and-conditions", "cookie-policy", "cookies",
  "legal", "disclaimer", "thank-you", "wp-json", "wp-content",
]);

// A path belongs to its longest matching section prefix and follows the
// user's include or exclude choice for it. Paths that match NO known
// section (tag archives and other junk often live outside the sitemap, so
// they were never offered as a choice) fall back to the junk blocklist.
export function makeExclusionCheck(sections: SiteSection[], excluded: string[]): (path: string) => boolean {
  const excludedSet = new Set(excluded);
  const prefixes = sections
    .map((s) => s.prefix)
    .sort((a, b) => b.length - a.length);
  return (path: string) => {
    const norm = path.replace(/\/+$/, "") || "/";
    for (const prefix of prefixes) {
      if (prefix === "/" ? !norm.slice(1).includes("/") : norm === prefix || norm.startsWith(prefix + "/")) {
        return excludedSet.has(prefix);
      }
    }
    return norm.split("/").some((seg) => JUNK_SEGMENTS.has(seg.toLowerCase()));
  };
}

// Fetches an exact list of URLs with no link following. Used by the teaser
// scan to sample a diverse slice of the site instead of one section.
export async function crawlUrls(urls: string[]): Promise<CrawledPage[]> {
  const results: CrawledPage[] = [];
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      if (!url) return;
      const res = await fetchText(url, "text/html,application/xhtml+xml");
      if (!res || !/text\/html|application\/xhtml/i.test(res.contentType)) continue;
      try {
        const page = extractPage(res.text, url);
        const parsed = new URL(url);
        results.push({ ...page, url, path: parsed.pathname.replace(/\/+$/, "") || "/" });
      } catch {
        /* skip unparseable pages */
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return results;
}

export async function crawlSite(
  startUrl: string,
  maxPages: number,
  isExcluded?: (path: string) => boolean,
  onProgress?: (crawled: number, queued: number) => void,
): Promise<CrawledPage[]> {
  const start = new URL(startUrl);
  const origin = start.origin;
  const host = stripWww(start.hostname);

  const allowed = await loadRobots(origin);
  const sitemapUrls = await loadSitemap(origin);

  const queue: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    try {
      const parsed = new URL(u);
      if (stripWww(parsed.hostname) !== host) return;
      parsed.hostname = start.hostname;
      parsed.protocol = start.protocol;
      const norm = normalizeUrl(parsed);
      if (seen.has(norm)) return;
      if (!allowed(parsed.pathname + parsed.search)) return;
      if (isExcluded?.(parsed.pathname)) return;
      seen.add(norm);
      queue.push(norm);
    } catch {
      /* ignore bad urls */
    }
  };

  push(normalizeUrl(start));
  push(`${origin}/`);
  for (const u of sitemapUrls) push(u);

  const results: CrawledPage[] = [];

  async function worker() {
    while (results.length < maxPages) {
      const url = queue.shift();
      if (!url) return;
      const res = await fetchText(url, "text/html,application/xhtml+xml");
      if (!res || !/text\/html|application\/xhtml/i.test(res.contentType)) continue;
      if (results.length >= maxPages) return;
      try {
        const page = extractPage(res.text, url);
        const parsed = new URL(url);
        results.push({ ...page, url, path: parsed.pathname.replace(/\/+$/, "") || "/" });
        for (const link of page.links) push(link.href);
        onProgress?.(results.length, queue.length);
      } catch {
        /* skip unparseable pages */
      }
    }
  }

  // Rounds of workers: each round drains what is currently queued, and new
  // URLs discovered during a round are picked up by the next round.
  while (queue.length && results.length < maxPages) {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  }

  return results;
}
