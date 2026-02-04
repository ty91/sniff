import Database from "better-sqlite3";
import { getLlama } from "node-llama-cpp";
import type { Llama, LlamaModel, LlamaEmbeddingContext, Token } from "node-llama-cpp";
import { RankedItem } from "./bm25-search.js";
import { makeChunkId } from "../utils/chunk-id.js";

export type EmbeddingModel = {
  embed: (input: string | Token[]) => Promise<Float32Array>;
  tokenize: (text: string) => Token[];
  detokenize: (tokens: readonly Token[], specialTokens?: boolean, lastTokens?: readonly Token[]) => string;
  trainContextSize: number;
  dispose: () => Promise<void>;
};

function normalizeVector(vector: Float32Array) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) {
    sum += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sum) || 1;
  const normalized = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    normalized[i] = vector[i] / norm;
  }
  return normalized;
}

function bufferToFloat32(buffer: Buffer | Uint8Array) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

export async function createEmbeddingModel(modelPath: string): Promise<EmbeddingModel> {
  const llama: Llama = await getLlama();
  const model: LlamaModel = await llama.loadModel({ modelPath });
  const ctx: LlamaEmbeddingContext = await model.createEmbeddingContext();

  return {
    embed: async (input: string | Token[]) => {
      const embedding = await ctx.getEmbeddingFor(input);
      return normalizeVector(Float32Array.from(embedding.vector));
    },
    tokenize: (text: string) => model.tokenize(text),
    detokenize: (tokens, specialTokens = false, lastTokens) =>
      model.detokenize(tokens, specialTokens, lastTokens),
    trainContextSize: model.trainContextSize,
    dispose: async () => {
      await ctx.dispose();
      await model.dispose();
      await llama.dispose();
    },
  };
}

export async function embeddingSearch(
  sqlite: Database.Database,
  query: string,
  model: EmbeddingModel,
  limit: number
): Promise<RankedItem[]> {
  const queryVector = await model.embed(query);
  const rows = sqlite
    .prepare("SELECT note_id as note_id, chunk_index as chunk_index, vector FROM embeddings")
    .all() as Array<{ note_id: string; chunk_index: number; vector: Buffer }>;

  const scored: RankedItem[] = [];
  const maxResults = Math.max(0, Math.floor(limit));
  for (const row of rows) {
    const vector = bufferToFloat32(row.vector);
    if (vector.length !== queryVector.length) continue;

    let dot = 0;
    for (let i = 0; i < vector.length; i += 1) {
      dot += vector[i] * queryVector[i];
    }
    if (maxResults === 0) continue;
    const id = makeChunkId(String(row.note_id), Number(row.chunk_index));
    if (scored.length < maxResults) {
      scored.push({ id, score: dot });
      scored.sort((a, b) => a.score - b.score);
      continue;
    }
    if (dot <= scored[0].score) continue;
    scored[0] = { id, score: dot };
    scored.sort((a, b) => a.score - b.score);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
