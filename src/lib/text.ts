// Small, dependency-free text analysis: tokenizing, TF-IDF, cosine similarity,
// sentence splitting and phrase matching. Fast enough for a few hundred pages.

const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with you your yours yourself yourselves " +
    "get got also may might must shall could would like one two new use using used way ways make makes making need needs every much many still even see say said"
  ).split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && w.length < 30 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export type Vec = Map<string, number>;

export function buildTfidf(docs: string[][]): { vectors: Vec[]; idf: Map<string, number> } {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log(1 + n / count));

  const vectors = docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const term of doc) tf.set(term, (tf.get(term) ?? 0) + 1);
    const vec: Vec = new Map();
    let norm = 0;
    for (const [term, count] of tf) {
      const w = (1 + Math.log(count)) * (idf.get(term) ?? 0);
      vec.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, w] of vec) vec.set(term, w / norm);
    return vec;
  });
  return { vectors, idf };
}

export function cosine(a: Vec, b: Vec): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const w2 = large.get(term);
    if (w2) dot += w * w2;
  }
  return dot;
}

export function topTerms(vec: Vec, n: number): string[] {
  return [...vec.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([t]) => t);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 30 && s.length <= 400);
}

export function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const phraseRegexCache = new Map<string, RegExp>();

// Finds `phrase` (normalized match, word boundaries) inside `sentence` and
// returns it exactly as written in the sentence, or null.
export function findPhraseInSentence(sentence: string, phrase: string): string | null {
  let pattern = phraseRegexCache.get(phrase);
  if (!pattern) {
    const words = phrase.trim().split(/\s+/).map(escapeRegExp);
    if (!words.length) return null;
    pattern = new RegExp(`(?<![A-Za-z0-9])${words.join("[\\s'’\\-]+")}(?![A-Za-z0-9])`, "i");
    if (phraseRegexCache.size > 20000) phraseRegexCache.clear();
    phraseRegexCache.set(phrase, pattern);
  }
  const m = sentence.match(pattern);
  return m ? m[0] : null;
}

function isStopword(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  return !w || STOPWORDS.has(w) || w.length < 2;
}

// Candidate anchor phrases for a target page: n-grams from title and h1,
// plus top tf-idf bigrams found in the body. Longer phrases first. A good
// anchor never starts or ends with a stopword.
export function targetPhrases(title: string, h1: string, terms: string[]): string[] {
  const out = new Set<string>();
  const sources = [cleanTitle(title), cleanTitle(h1)];
  for (const src of sources) {
    const words = src.split(/\s+/).filter(Boolean);
    for (let size = Math.min(6, words.length); size >= 2; size--) {
      for (let i = 0; i + size <= words.length; i++) {
        const slice = words.slice(i, i + size);
        if (isStopword(slice[0]) || isStopword(slice[slice.length - 1])) continue;
        const gram = slice.join(" ");
        const content = tokenize(gram);
        if (content.length >= Math.max(1, size - 2)) out.add(gram);
      }
    }
  }
  for (let i = 0; i < terms.length - 1 && out.size < 60; i++) {
    out.add(`${terms[i]} ${terms[i + 1]}`);
  }
  for (const t of terms.slice(0, 5)) if (t.length >= 5) out.add(t);
  return [...out].sort((a, b) => b.split(" ").length - a.split(" ").length).slice(0, 80);
}

export function cleanTitle(title: string): string {
  // Drop the brand suffix: "How solar rebates work | Acme" -> "How solar rebates work"
  return title
    .split(/\s*[|·»–—-]{1,2}\s+(?=[A-Z0-9])/)[0]
    .replace(/\s+/g, " ")
    .trim();
}
