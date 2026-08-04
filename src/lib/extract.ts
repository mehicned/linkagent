import * as cheerio from "cheerio";

export interface ExtractedPage {
  title: string;
  h1: string;
  description: string;
  headings: string[];
  text: string;
  wordCount: number;
  // Every internal link on the page, nav included. Used for crawl discovery
  // and click depth.
  links: { href: string; anchor: string }[];
  // Links inside the main content only. These are the ones that carry SEO
  // equity, so the link graph and all stats are built from them.
  contentLinks: { href: string; anchor: string }[];
}

const STRIP = "script,style,noscript,svg,iframe,form,nav,header,footer,aside,[aria-hidden=true],[role=navigation],[role=banner],[role=contentinfo]";

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim().slice(0, 300);
  const description = ($('meta[name="description"]').attr("content") ?? "").trim().slice(0, 500);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim().slice(0, 300);

  // Collect internal links from the full document before stripping chrome,
  // so we get the real link graph including nav links.
  const base = new URL(pageUrl);
  const links: { href: string; anchor: string }[] = [];
  $("a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw) return;
    const resolved = resolveInternal(raw, base);
    if (resolved) {
      links.push({ href: resolved, anchor: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) });
    }
  });

  $(STRIP).remove();
  const $main = $("main, article, [role=main]").first();
  const scope = $main.length ? $main : $("body");

  // In-text links: anchors that survive chrome stripping and live inside the
  // content scope. Nav, header, footer and sidebar links never end up here.
  const contentLinks: { href: string; anchor: string }[] = [];
  scope.find("a[href]").each((_, el) => {
    const raw = $(el).attr("href");
    if (!raw) return;
    const resolved = resolveInternal(raw, base);
    if (resolved) {
      contentLinks.push({ href: resolved, anchor: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) });
    }
  });

  const headings: string[] = [];
  scope.find("h2, h3").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length < 200) headings.push(t);
  });

  // Remove elements we must never inject into or read anchors from.
  scope.find("a, button, code, pre, h1, h2, h3, h4, h5, h6, figcaption").remove();

  // Keep block boundaries as newlines so sentences do not merge across elements.
  scope.find("p, li, div, section, blockquote, td, br").each((_, el) => {
    $(el).prepend("\n");
    $(el).append("\n");
  });

  const text = scope
    .text()
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 60000);

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return { title, h1, description, headings: headings.slice(0, 40), text, wordCount, links, contentLinks };
}

export function normalizeUrl(u: URL): string {
  u.hash = "";
  // Drop common tracking params, keep meaningful ones.
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$|replytocom)/.test(key)) u.searchParams.delete(key);
  }
  let path = u.pathname.replace(/\/+$/, "");
  if (!path) path = "/";
  return `${u.origin}${path}${u.search}`;
}

export function normalizePath(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  return p || "/";
}

const SKIP_EXT = /\.(jpg|jpeg|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|rss|atom|pdf|zip|gz|mp4|mp3|webm|woff2?|ttf|eot|txt|csv|docx?|xlsx?|pptx?)$/i;

function resolveInternal(href: string, base: URL): string | null {
  if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) return null;
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (stripWww(u.hostname) !== stripWww(base.hostname)) return null;
  if (SKIP_EXT.test(u.pathname)) return null;
  // Keep everything on the canonical host of the crawl.
  u.protocol = base.protocol;
  u.hostname = base.hostname;
  u.port = base.port;
  return normalizeUrl(u);
}

export function stripWww(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}
