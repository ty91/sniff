import { RankedItem } from "./bm25-search.js";

export type RrfResult = {
  id: string;
  score: number;
};

export function rrfMixer(lists: RankedItem[][], k: number): RrfResult[] {
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, index) => {
      const rank = index + 1;
      const existing = scores.get(item.id) ?? 0;
      scores.set(item.id, existing + 1 / (k + rank));
    });
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
