# LinkAgent

Open source internal linking agent. LinkAgent crawls your site, understands your content, and finds the internal links you are missing. You approve them, add one tiny script, and the links go live.

No lock-in. One Next.js app plus any Postgres database. Runs on Vercel, your own server, or your laptop.

## How it works

1. **Crawl.** Reads your sitemap and follows internal links. Respects robots.txt. Extracts the real content of every page (title, headings, body text) and the existing link graph.
2. **Analyze.** Builds TF-IDF vectors for every page, groups pages into topic clusters, and computes link graph stats: inbound in-text links, click depth from the homepage, and orphan pages. Only in-text links count as the SEO graph. Nav, header, footer and sidebar links are ignored, because that is how search engines weigh them.
3. **Find opportunities.** For every pair of related pages it looks for a natural anchor phrase that already exists in the source page's copy. Every candidate is scored on topical similarity, anchor quality, source content depth, and how much the target page needs links. Links only come from unique prose: template sentences that repeat across pages can never host a link.
4. **Balance.** Link volume is capped by page length (about one new link per 250 words, max 8). Each target gets at most 12 new inbound links. The same anchor text is never used for more than about a third of a target's links, so anchors stay varied and natural. Directory style collections get extra care: sibling listings (one company profile, product page and so on to another) are never linked to each other, and a link to a listing page must use that page's actual name as the anchor, never a generic phrase.
5. **AI polish (optional).** With an `ANTHROPIC_API_KEY`, Claude reviews the top opportunities, drops weak ones, and picks better anchor phrases. Every AI anchor is validated as an exact substring of the sentence before it is accepted, so the model can never invent text that is not on your page.
6. **Ship.** Approve links in the dashboard, then add the script to your site.

## The script

```html
<script src="https://your-linkagent-host/linkagent.js" data-key="pk_xxx" defer></script>
```

About 2 KB, zero dependencies, no styles, no layout shift.

What it does on each page load:

- Fetches one small JSON file with the link rules for the current path only. Cached for 5 minutes.
- Waits for the browser to be idle before touching the DOM.
- Finds the anchor phrase in a text node and wraps it in a plain `<a>` tag. It never rewrites or adds text.
- Skips headings, nav, header, footer, existing links, buttons, forms, code blocks, and anything marked `data-la-skip` or `aria-hidden`.
- Skips a link when the page already links to that target anywhere.
- Injected links inherit your site's normal link styles and carry a `data-la` attribute so you can spot or style them.

For single page apps add `data-spa="true"` and links refresh on route changes.

### Prefer server side rendering?

Google renders JavaScript, so injected links do count. But if you want links in the raw HTML, fetch the full map and apply it in your templates or CMS:

```
GET /api/map/pk_xxx           -> { map: { "/some/page": [{ t: "anchor text", h: "/target", ti: "Target title" }] } }
GET /api/map/pk_xxx?p=/page   -> { rules: [...] }  (what the script uses)
```

## Quickstart

You need a Postgres database. A free [Neon](https://neon.tech) project works great.

```bash
git clone <repo>
cd linkagent
npm install
cp .env.example .env   # set DATABASE_URL and BETTER_AUTH_SECRET
npx drizzle-kit push                                    # create app tables
npx @better-auth/cli migrate --config src/lib/auth.ts   # create auth tables
npm run dev
```

Open http://localhost:3000, create an account, paste a site URL, review the suggestions, approve, install the script.

Deploying to Vercel: push to GitHub, import the repo, set the env vars, done. The included `vercel.json` schedules the daily auto refresh cron. Self-hosting on a normal Node server works too, and there the built-in scheduler handles auto refresh without any cron setup.

## Configuration

| Env var | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | required | Postgres connection string. |
| `BETTER_AUTH_SECRET` | required | Random string that signs auth sessions. |
| `ANTHROPIC_API_KEY` | none | Enables AI anchor review. Works fine without it. |
| `LINKAGENT_MODEL` | `claude-opus-5` | Model used for anchor review. |
| `LINKAGENT_MAX_PAGES` | `200` | Crawl cap per site. |
| `CRON_SECRET` | none | Protects the cron endpoint on Vercel. |

## Serving modes

- **Approved only** (default): the script only serves links you approved.
- **Autopilot**: new suggestions go live right away. You can still reject any link and it disappears on the next map refresh.

## What LinkAgent will not do

- It will not invent anchor text. Anchors are always phrases that already exist on the source page.
- It will not stuff links. Caps by page length, per-target limits, and anchor variety are enforced when the map is built.
- It will not touch navigation, headings, or boilerplate. Content links only.
- It will not slow your site down. One deferred script, one small cached request, DOM work on idle.

## Stack

Next.js 16, React 19, Drizzle ORM, Postgres (Neon serverless driver), Better Auth, cheerio, Tailwind 4. The embed script is hand-written vanilla JS.

## License

MIT
