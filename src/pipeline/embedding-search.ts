import Database from "better-sqlite3";
import { getLlama } from "node-llama-cpp";
import type { Llama, LlamaModel, LlamaEmbeddingContext } from "node-llama-cpp";
import { RankedItem } from "./bm25-search.js";

export type EmbeddingModel = {
  embed: (text: string) => Promise<Float32Array>;
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
    embed: async (text: string) => {
      const embedding = await ctx.getEmbeddingFor(text);
      return normalizeVector(Float32Array.from(embedding.vector));
    },
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
  const rows = sqlite.prepare("SELECT note_id as id, vector FROM embeddings").all();

  const scored: RankedItem[] = [];
  for (const row of rows) {
    const vector = bufferToFloat32(row.vector);
    if (vector.length !== queryVector.length) continue;

    let dot = 0;
    for (let i = 0; i < vector.length; i += 1) {
      dot += vector[i] * queryVector[i];
    }
    scored.push({ id: String(row.id), score: dot });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
