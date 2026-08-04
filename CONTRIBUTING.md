# Contributing to Linkagent

Thanks for wanting to help. Linkagent is MIT licensed and contributions of any size are welcome.

## Getting set up

You need Node 20+ and a Postgres database (a free Neon project works).

```bash
git clone https://github.com/mehicned/linkagent
cd linkagent
npm install
cp .env.example .env   # set DATABASE_URL and BETTER_AUTH_SECRET
npx drizzle-kit push
npx @better-auth/cli migrate --config src/lib/auth.ts
npm run dev
```

Everything works without an `ANTHROPIC_API_KEY`. With one, Claude reviews anchor text and clusters pages by topic.

## Where things live

- `src/lib/crawler.ts` - sitemap and BFS crawling, robots.txt, structure discovery
- `src/lib/extract.ts` - content extraction, in-text vs nav link separation
- `src/lib/text.ts` / `analyze.ts` - TF-IDF, similarity, graph stats
- `src/lib/opportunities.ts` - opportunity scoring and balance rules
- `src/lib/ai.ts` - Claude anchor review and clustering
- `src/lib/pipeline.ts` - the crawl-analyze-swap pipeline
- `public/linkagent.js` - the embed script (vanilla JS, keep it tiny)
- `src/app` - Next.js app (marketing pages, auth, dashboard)

## Ground rules for changes

- The embed script must stay dependency-free and small. Every byte is served on other people's sites.
- Anchors are never invented, only found in existing page text. Do not change this.
- Links never point between sibling listing pages, never sit in boilerplate sentences, and volume caps stay enforced server side.
- Run `npx tsc --noEmit` and `npm run build` before opening a PR.

## Bugs and ideas

Open a GitHub issue with the site behavior you saw and what you expected. For crawler bugs, include the site URL if you can share it, since robots.txt and sitemap quirks are usually the cause.
