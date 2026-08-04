import Anthropic from "@anthropic-ai/sdk";
import { findPhraseInSentence, normalizePhrase } from "./text";
import type { RawOpportunity } from "./opportunities";
import type { CrawledPage } from "./crawler";

const MODEL = process.env.LINKAGENT_MODEL || "claude-opus-5";
const BATCH_SIZE = 20;
const MAX_REFINED = 120;

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
