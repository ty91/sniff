import { getLlama, LlamaLogLevel } from "node-llama-cpp";
import type { Llama, LlamaModel, LlamaRankingContext } from "node-llama-cpp";

export type RerankCandidate = {
  id: string;
  noteId: string;
  chunkIndex: number;
  title: string;
  text: string;
  score: number;
};

export type Reranker = {
  rankAll: (query: string, documents: string[]) => Promise<number[]>;
  dispose: () => Promise<void>;
};

export async function createReranker(modelPath: string): Promise<Reranker> {
  const llama: Llama = await getLlama({ logLevel: LlamaLogLevel.error });
  const model: LlamaModel = await llama.loadModel({ modelPath });
  const ctx: LlamaRankingContext = await model.createRankingContext();

  return {
    rankAll: async (query: string, documents: string[]) => {
      return ctx.rankAll(query, documents);
    },
    dispose: async () => {
      await ctx.dispose();
      await model.dispose();
      await llama.dispose();
    },
  };
}

export async function rerankCandidates(
  reranker: Reranker,
  query: string,
  candidates: RerankCandidate[]
): Promise<RerankCandidate[]> {
  const documents = candidates.map((item) => `${item.title}\n\n${item.text}`.trim());
  const scores = await reranker.rankAll(query, documents);

  const reranked = candidates.map((item, index) => ({
    ...item,
    score: scores[index] ?? 0,
  }));

  return reranked.sort((a, b) => b.score - a.score);
}
