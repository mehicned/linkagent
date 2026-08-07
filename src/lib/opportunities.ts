import { cosine, findPhraseInSentence, normalizePhrase, splitSentences, targetPhrases, cleanTitle, tokenize, type Vec } from "./text";
import type { CrawledPage } from "./crawler";

export interface RawOpportunity {
  fromIndex: number;
  toIndex: number;
  anchor: string;
  sentence: string;
  score: number;
  reason: string;
  // When the target is a collection item (company profile, product page),
  // any anchor, including an AI rewrite, must stay inside this normalized
  // title so generic phrases never point at a specific entity.
  entityTitleNorm: string | null;
}

const MIN_SIMILARITY = 0.08;
const MAX_INBOUND_PER_TARGET = 12;
const MAX_ANCHOR_REPEAT_SHARE = 0.34; // same anchor for one target stays under about a third
const COLLECTION_MIN_SIBLINGS = 6;
const BOILERPLATE_PAGE_LIMIT = 2; // a sentence on more pages than this is template text
const COMMON_TERM_PAGE_SHARE = 0.25; // a term in the top terms of this share of pages is site-generic

// How many new links a page can absorb: based on its length, capped by the
// site's own setting.
function capacity(wordCount: number, maxPerPage: number): number {
  return Math.max(1, Math.min(maxPerPage, Math.floor(wordCount / 250)));
}

// Pages that share a parent path with many siblings are collection items:
// company profiles in a directory, products in a catalog, and so on.
// Returns the collection key per page, or null for standalone content.
function detectCollections(pagesData: CrawledPage[]): (string | null)[] {
  const parentOf = pagesData.map((p) => {
    const cut = p.path.lastIndexOf("/");
    return cut <= 0 ? "/" : p.path.slice(0, cut);
  });
  const siblingCount = new Map<string, number>();
  for (const parent of parentOf) siblingCount.set(parent, (siblingCount.get(parent) ?? 0) + 1);
  return parentOf.map((parent) => ((siblingCount.get(parent) ?? 0) >= COLLECTION_MIN_SIBLINGS ? parent : null));
}

export async function findOpportunities(
  pagesData: CrawledPage[],
  vectors: Vec[],
  topTermsPerPage: string[][],
  inDegree: number[],
  existingEdges: Set<string>, // "from>to" page indexes
  existingAnchorsByPage: Map<number, Set<string>>, // normalized anchors already linked on that page
  maxLinksPerPage = 6,
  clusterOfPage: (number | null)[] = [],
  isOrphan: boolean[] = [],
  depth: (number | null)[] = [],
): Promise<RawOpportunity[]> {
  const n = pagesData.length;
  const sentencesPerPage = pagesData.map((p) => splitSentences(p.text).slice(0, 150));
  // Pre-lowercased sentences let us run a cheap indexOf prefilter before the
  // word-boundary regex, which keeps the pair loop fast on large sites.
  const sentencesLower = sentencesPerPage.map((list) => list.map((s) => s.toLowerCase()));
  const phrasesPerTarget = pagesData.map((p, i) => targetPhrases(p.title, p.h1, topTermsPerPage[i]));
  // First word of each phrase, lowercased: regex separators are flexible but
  // the first word always appears verbatim, so it is a safe prefilter.
  const phrasesFirstWord = phrasesPerTarget.map((list) => list.map((p) => p.split(/\s+/)[0].toLowerCase()));
  const maxIn = Math.max(1, ...inDegree);
  const collectionOf = detectCollections(pagesData);

  // Terms that dominate the whole site (the niche vocabulary itself, like
  // "solar" on a solar site) make meaningless single-word anchors.
  const termPageCount = new Map<string, number>();
  for (const terms of topTermsPerPage) {
    for (const t of terms) termPageCount.set(t, (termPageCount.get(t) ?? 0) + 1);
  }
  const isSiteGenericTerm = (term: string) => (termPageCount.get(term) ?? 0) > n * COMMON_TERM_PAGE_SHARE;

  // Tokenized target titles for anchor-to-title overlap scoring.
  const titleTokensPerTarget = pagesData.map((p) => new Set(tokenize(`${cleanTitle(p.title)} ${p.h1}`)));

  // Template sentences repeated across pages (footers baked into the body,
  // profile boilerplate) can never host a contextual link.
  const sentencePageCount = new Map<string, number>();
  sentencesLower.forEach((list) => {
    for (const s of new Set(list)) sentencePageCount.set(s, (sentencePageCount.get(s) ?? 0) + 1);
  });
  const isBoilerplate = (sentenceLower: string) => (sentencePageCount.get(sentenceLower) ?? 0) > BOILERPLATE_PAGE_LIMIT;

  const candidates: RawOpportunity[] = [];

  for (let to = 0; to < n; to++) {
    if (to % 5 === 0) await new Promise<void>((r) => setImmediate(r));
    const phrases = phrasesPerTarget[to];
    if (!phrases.length) continue;
    const titleNorm = normalizePhrase(cleanTitle(pagesData[to].title) || pagesData[to].h1);
    const titleTokens = titleTokensPerTarget[to];
    const targetIsItem = collectionOf[to] !== null;

    // How much this target needs equity: few inbound links, orphaned, or
    // buried deep in the click graph all raise the priority.
    const inNeed = 1 - inDegree[to] / (maxIn + 1);
    const orphanNeed = isOrphan[to] ? 0.35 : 0;
    const depthNeed = depth[to] === null || (depth[to] as number) >= 4 ? 0.15 : 0;
    const needBoost = Math.min(1, inNeed * 0.6 + orphanNeed + depthNeed);

    for (let from = 0; from < n; from++) {
      if (from === to) continue;
      if (existingEdges.has(`${from}>${to}`)) continue;
      // Never link collection siblings to each other: one company profile
      // pointing at a competing profile helps nobody.
      if (collectionOf[from] !== null && collectionOf[from] === collectionOf[to]) continue;
      const sim = cosine(vectors[from], vectors[to]);
      if (sim < MIN_SIMILARITY) continue;
      if (pagesData[from].wordCount < 120) continue;

      const linkedAnchors = existingAnchorsByPage.get(from);
      let best: RawOpportunity | null = null;

      const fromSentences = sentencesPerPage[from];
      const fromSentencesLower = sentencesLower[from];
      const firstWords = phrasesFirstWord[to];

      const contentBoost = Math.min(pagesData[from].wordCount / 1500, 1) * 0.08;
      // Links inside the same topic cluster are the classic siloing play.
      const clusterBoost =
        clusterOfPage[from] !== null && clusterOfPage[from] !== undefined && clusterOfPage[from] === clusterOfPage[to]
          ? 0.07
          : 0;

      for (let si = 0; si < fromSentences.length; si++) {
        const sentence = fromSentences[si];
        const sentenceLower = fromSentencesLower[si];
        if (isBoilerplate(sentenceLower)) continue;
        // Earlier placement carries more equity and matches the script,
        // which links the first occurrence on the page.
        const positionBoost = Math.max(0, 0.05 - (si / Math.max(fromSentences.length, 1)) * 0.05);
        for (let pi = 0; pi < phrases.length; pi++) {
          if (!sentenceLower.includes(firstWords[pi])) continue;
          const phrase = phrases[pi];
          const found = findPhraseInSentence(sentence, phrase);
          if (!found || found.length < 4) continue;
          const norm = normalizePhrase(found);
          if (linkedAnchors?.has(norm)) continue; // that text already links somewhere
          // A link to a specific entity page must use that entity's name,
          // never a generic phrase that could describe its competitors too.
          if (targetIsItem && !titleNorm.includes(norm)) continue;

          const anchorTokens = tokenize(norm);
          const words = norm.split(" ").length;
          // Single-word anchors must be distinctive: in the target's title
          // and not part of the site's ambient vocabulary.
          if (words === 1) {
            const term = anchorTokens[0] ?? norm;
            if (term.length < 6 || !titleTokens.has(term) || isSiteGenericTerm(term)) continue;
          }

          // Anchor quality: length up to three words, plus how much of the
          // anchor actually describes the target page.
          const overlap =
            anchorTokens.length > 0
              ? anchorTokens.filter((t) => titleTokens.has(t)).length / anchorTokens.length
              : 0;
          const phraseScore = Math.min(words / 3, 1) * 0.55 + overlap * 0.45;

          const score =
            sim * 0.38 + phraseScore * 0.27 + needBoost * 0.15 + contentBoost + clusterBoost + positionBoost;
          if (!best || score > best.score) {
            best = {
              fromIndex: from,
              toIndex: to,
              anchor: found,
              sentence,
              score,
              reason: `similarity ${(sim * 100).toFixed(0)}%, target has ${inDegree[to]} inbound link${inDegree[to] === 1 ? "" : "s"}${isOrphan[to] ? ", orphan" : ""}`,
              entityTitleNorm: targetIsItem ? titleNorm : null,
            };
          }
        }
      }
      if (best) candidates.push(best);
    }
  }

  // Greedy selection under balance rules.
  candidates.sort((a, b) => b.score - a.score);
  const usedCapacity = new Map<number, number>();
  const inboundCount = new Map<number, number>();
  const anchorUse = new Map<string, number>(); // `${to}|${normAnchor}`
  const sourceAnchorUsed = new Set<string>(); // `${from}|${normAnchor}`
  const pickedPairs = new Set<string>();
  const picked: RawOpportunity[] = [];

  for (const c of candidates) {
    const cap = capacity(pagesData[c.fromIndex].wordCount, maxLinksPerPage);
    if ((usedCapacity.get(c.fromIndex) ?? 0) >= cap) continue;
    const inbound = inboundCount.get(c.toIndex) ?? 0;
    if (inbound >= MAX_INBOUND_PER_TARGET) continue;
    // A back-and-forth pair of new links between two pages reads reciprocal
    // and manufactured; keep only the stronger direction.
    if (pickedPairs.has(`${c.toIndex}>${c.fromIndex}`)) continue;
    const norm = normalizePhrase(c.anchor);
    // The same words on one page must never link to two different targets.
    const sourceKey = `${c.fromIndex}|${norm}`;
    if (sourceAnchorUsed.has(sourceKey)) continue;
    const anchorKey = `${c.toIndex}|${norm}`;
    const sameAnchor = anchorUse.get(anchorKey) ?? 0;
    if (inbound >= 2 && (sameAnchor + 1) / (inbound + 1) > MAX_ANCHOR_REPEAT_SHARE) continue;

    picked.push(c);
    pickedPairs.add(`${c.fromIndex}>${c.toIndex}`);
    sourceAnchorUsed.add(sourceKey);
    usedCapacity.set(c.fromIndex, (usedCapacity.get(c.fromIndex) ?? 0) + 1);
    inboundCount.set(c.toIndex, inbound + 1);
    anchorUse.set(anchorKey, sameAnchor + 1);
  }

  return picked;
}
