import { Command } from "commander";
import { loadConfig } from "../config/load-config.js";
import { createAppDb } from "../db/sqlite-client.js";
import { bm25Search } from "../pipeline/bm25-search.js";
import { createEmbeddingModel, embeddingSearch } from "../pipeline/embedding-search.js";
import { rrfMixer } from "../pipeline/rrf-mixer.js";
import { createReranker, rerankCandidates, type RerankCandidate } from "../pipeline/reranker.js";
import { selectTopN } from "../pipeline/topn.js";
import { resolveEmbeddingPath, resolveRerankerPath } from "../models/resolve-models.js";
import { createVerboseLogger } from "../utils/verbose.js";
import { makeChunkId, parseChunkId } from "../utils/chunk-id.js";

function fetchChunksByIds(sqlite: ReturnType<typeof createAppDb>["sqlite"], ids: string[]) {
  if (ids.length === 0) return [];
  const refs = ids.map((id) => parseChunkId(id)).filter(Boolean) as Array<{
    noteId: string;
    chunkIndex: number;
  }>;
  if (refs.length === 0) return [];
  const placeholders = refs.map(() => "(?, ?)").join(",");
  const params = refs.flatMap((ref) => [ref.noteId, ref.chunkIndex]);
  const rows = sqlite
    .prepare(
      `SELECT n.id as note_id, n.title as title, f.chunk_index as chunk_index, f.text as text
       FROM notes_fts f
       JOIN notes n ON n.id = f.note_id
       WHERE (f.note_id, f.chunk_index) IN (${placeholders})`
    )
    .all(...params);
  return rows.map((row: any) => ({
    id: makeChunkId(String(row.note_id), Number(row.chunk_index)),
    noteId: String(row.note_id),
    chunkIndex: Number(row.chunk_index),
    title: row.title ? String(row.title) : "",
    text: row.text ? String(row.text) : "",
  }));
}

export function registerQueryCommand(program: Command) {
  program
    .command("query")
    .argument("<query>")
    .option("--output <format>", "md | text | json", "md")
    .option("--top-n <number>", "override topN from config")
    .option("-v, --verbose", "enable verbose logging")
    .description("Query local RAG index")
    .action(
      async (
        query: string,
        options: { output: string; topN?: string; verbose?: boolean }
      ) => {
      const config = loadConfig();
      const embeddingPath = await resolveEmbeddingPath(config);
      const rerankerPath = await resolveRerankerPath(config);
      const { sqlite } = createAppDb(config.dbPath);
      const logVerbose = createVerboseLogger(Boolean(options.verbose));

      try {
        logVerbose("config", { ok: 1 });
        logVerbose("model_paths", { ok: 1 });
        logVerbose("db_open", { ok: 1 });
        const topN = options.topN ? Number(options.topN) : config.topN;
        const bm25Limit = Math.max(config.rerankTopK * 2, 100);
        const embedLimit = Math.max(config.rerankTopK * 2, 100);

        const bm25Results = bm25Search(sqlite, query, bm25Limit);
        logVerbose("bm25", { count: bm25Results.length, limit: bm25Limit });

        const embedder = await createEmbeddingModel(embeddingPath);
        let embeddingResults: { id: string; score: number }[] = [];
        try {
          embeddingResults = await embeddingSearch(sqlite, query, embedder, embedLimit);
        } finally {
          await embedder.dispose();
        }
        logVerbose("embedding", { count: embeddingResults.length, limit: embedLimit });

        const mixed = rrfMixer([bm25Results, embeddingResults], config.rrfK);
        logVerbose("rrf_mix", { count: mixed.length, rrfK: config.rrfK });
        const rerankSeed = mixed.slice(0, config.rerankTopK);
        logVerbose("rerank_seed", { count: rerankSeed.length, limit: config.rerankTopK });
        const chunks = fetchChunksByIds(sqlite, rerankSeed.map((item) => item.id));
        logVerbose("chunks", { count: chunks.length });
        const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));

        const candidates: RerankCandidate[] = rerankSeed
          .map((item) => {
            const chunk = chunkMap.get(item.id);
            if (!chunk) return null;
            return {
              id: chunk.id,
              noteId: chunk.noteId,
              chunkIndex: chunk.chunkIndex,
              title: chunk.title,
              text: chunk.text,
              score: item.score,
            };
          })
          .filter(Boolean) as RerankCandidate[];
        logVerbose("candidates", { count: candidates.length });

        const reranker = await createReranker(rerankerPath);
        let reranked: RerankCandidate[] = [];
        try {
          reranked = await rerankCandidates(reranker, query, candidates);
        } finally {
          await reranker.dispose();
        }
        logVerbose("rerank", { count: reranked.length });

        const topResults = selectTopN(reranked, topN);
        logVerbose("topn", { count: topResults.length, limit: topN });
        const output = options.output.toLowerCase();

        const filteredResults = topResults.filter((item) => item.text.trim().length > 0);

        if (output === "json") {
          console.log(
            JSON.stringify(
              {
                query,
                results: filteredResults.map((item) => ({
                  id: item.id,
                  noteId: item.noteId,
                  chunkIndex: item.chunkIndex,
                  score: item.score,
                  text: item.text,
                })),
              },
              null,
              2
            )
          );
          logVerbose("output", { count: filteredResults.length });
          return;
        }

        if (output === "text") {
          filteredResults.forEach((item, index) => {
            console.log(`Chunk ${index + 1}:`);
            console.log(item.text);
            if (index < filteredResults.length - 1) console.log("");
          });
          logVerbose("output", { count: filteredResults.length });
          return;
        }

        filteredResults.forEach((item, index) => {
          console.log(`Chunk ${index + 1}:`);
          console.log("```");
          console.log(item.text);
          console.log("```");
          if (index < filteredResults.length - 1) console.log("");
        });
        logVerbose("output", { count: filteredResults.length });
      } finally {
        sqlite.close();
      }
    }
  );
}
