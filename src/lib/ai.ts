import Anthropic from "@anthropic-ai/sdk";
import { findPhraseInSentence, normalizePhrase } from "./text";
import type { RawOpportunity } from "./opportunities";
import type { CrawledPage } from "./crawler";

const MODEL = process.env.LINKAGENT_MODEL || "claude-opus-5";
const BATCH_SIZE = 20;
const MAX_REFINED = 120;
const MAX_CLUSTER_PAGES = 250;

export interface AICluster {
  label: string;
  members: number[]; // page indexes
}

// Asks Claude to organize the site's pages into topical clusters. The
// similarity-graph fallback tends to lump a whole site into one blob, and
// a model that reads titles does far better. Returns null without an API
// key or on any failure, and the caller falls back to the heuristic.
export async function clusterWithAI(
  pagesInfo: { path: string; title: string; terms: string[] }[],
): Promise<AICluster[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (pagesInfo.length < 4) return null;

  const client = new Anthropic();
  const items = pagesInfo.slice(0, MAX_CLUSTER_PAGES).map((p, id) => ({
    id,
    path: p.path,
    title: p.title.slice(0, 120),
    terms: p.terms.slice(0, 5),
  }));

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system:
        "You organize a website's pages into topical clusters for internal linking strategy. " +
        "Given pages with id, path, title and top terms, group them into tight topical clusters. " +
        "Aim for clusters a human content strategist would recognize: one per real topic, typically 4 to 15 clusters for a full site. " +
        "Every cluster gets a short label of 2 to 4 plain words. A page belongs to at most one cluster. " +
        "Leave a page out entirely if it fits nowhere. Never invent ids. " +
        'Reply with ONLY a JSON array: [{"label": string, "ids": number[]}]. No other text.',
      messages: [{ role: "user", content: JSON.stringify(items) }],
    });
    const textBlock = res.content.find((c) => c.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const parsed: { label?: unknown; ids?: unknown }[] = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");

    const assigned = new Set<number>();
    const clusters: AICluster[] = [];
    for (const c of parsed) {
      if (typeof c.label !== "string" || !Array.isArray(c.ids)) continue;
      const members = c.ids
        .filter((n): n is number => Number.isInteger(n) && n >= 0 && n < items.length && !assigned.has(n as number));
      if (members.length < 2) continue;
      members.forEach((m) => assigned.add(m));
      clusters.push({ label: c.label.trim().slice(0, 60), members });
    }
    return clusters.length >= 2 ? clusters : null;
  } catch {
    return null;
  }
}

export interface RefinedOpportunity extends RawOpportunity {
  source: "heuristic" | "ai";
}

// Asks Claude to review the top opportunities: keep or drop each one, and
// optionally pick a better anchor phrase from the same sentence. Every AI
// anchor is validated as a verbatim substring of the sentence before use.
// Without an API key this is a no-op and heuristic results ship as they are.
export async function refineWithAI(
  opportunities: RawOpportunity[],
  pagesData: CrawledPage[],
): Promise<RefinedOpportunity[]> {
  const asHeuristic = (o: RawOpportunity): RefinedOpportunity => ({ ...o, source: "heuristic" });
  if (!process.env.ANTHROPIC_API_KEY) return opportunities.map(asHeuristic);

  const client = new Anthropic();
  const head = opportunities.slice(0, MAX_REFINED);
  const tail = opportunities.slice(MAX_REFINED).map(asHeuristic);
  const refined: RefinedOpportunity[] = [];

  for (let i = 0; i < head.length; i += BATCH_SIZE) {
    const batch = head.slice(i, i + BATCH_SIZE);
    try {
      refined.push(...(await refineBatch(client, batch, pagesData)));
    } catch {
      refined.push(...batch.map(asHeuristic));
    }
  }
  return [...refined, ...tail];
}

async function refineBatch(
  client: Anthropic,
  batch: RawOpportunity[],
  pagesData: CrawledPage[],
): Promise<RefinedOpportunity[]> {
  const items = batch.map((o, idx) => ({
    id: idx,
    sentence: o.sentence,
    current_anchor: o.anchor,
    target_title: pagesData[o.toIndex].title || pagesData[o.toIndex].h1,
    target_path: pagesData[o.toIndex].path,
    target_summary: pagesData[o.toIndex].description || pagesData[o.toIndex].text.slice(0, 200),
    target_is_specific_entity: o.entityTitleNorm !== null,
  }));

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system:
      "You are an SEO internal linking expert. You review proposed internal links. " +
      "For each item you get a sentence from the source page, a proposed anchor phrase inside it, and the target page. " +
      "Rules: the anchor MUST be an exact substring of the sentence, 2 to 6 words, natural to click, and clearly describe the target page. " +
      "Prefer descriptive phrases over generic ones. Drop items where the sentence does not naturally relate to the target. " +
      "When target_is_specific_entity is true, the anchor must be (part of) that entity's own name from target_title. " +
      "If no phrase in the sentence names the entity, drop the item instead of using a generic anchor. " +
      "Drop items where the best available anchor is so generic it could point anywhere. " +
      'Reply with ONLY a JSON array: [{"id": number, "keep": boolean, "anchor": string}]. No other text.',
    messages: [{ role: "user", content: JSON.stringify(items) }],
  });

  const textBlock = res.content.find((c) => c.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "[]";
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  const parsed: { id: number; keep: boolean; anchor?: string }[] = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");
  const byId = new Map(parsed.map((p) => [p.id, p]));

  const out: RefinedOpportunity[] = [];
  batch.forEach((o, idx) => {
    const verdict = byId.get(idx);
    if (!verdict) {
      out.push({ ...o, source: "heuristic" });
      return;
    }
    if (!verdict.keep) return; // dropped by the model
    let anchor = o.anchor;
    if (verdict.anchor && verdict.anchor !== o.anchor) {
      const validated = findPhraseInSentence(o.sentence, verdict.anchor);
      // The rewrite must exist verbatim in the sentence, and for entity
      // targets it must still be part of the entity's own name.
      if (validated && (!o.entityTitleNorm || o.entityTitleNorm.includes(normalizePhrase(validated)))) {
        anchor = validated;
      }
    }
    out.push({ ...o, anchor, source: "ai" });
  });
  return out;
}
