import { Command } from "commander";
import { loadConfig } from "../config/load-config.js";
import { createAppDb } from "../db/sqlite-client.js";
import { bm25Search } from "../pipeline/bm25-search.js";
import { createEmbeddingModel, embeddingSearch } from "../pipeline/embedding-search.js";
import { rrfMixer } from "../pipeline/rrf-mixer.js";
import { createReranker, rerankCandidates, type RerankCandidate } from "../pipeline/reranker.js";
import { selectTopN } from "../pipeline/topn.js";
import { resolveModelPaths } from "../models/resolve-models.js";

function fetchNotesByIds(sqlite: ReturnType<typeof createAppDb>["sqlite"], ids: string[]) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = sqlite
    .prepare(`SELECT id, title, text FROM notes WHERE id IN (${placeholders})`)
    .all(...ids);
  return rows.map((row: any) => ({
    id: String(row.id),
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
    .description("Query local RAG index")
    .action(async (query: string, options: { output: string; topN?: string }) => {
      const config = loadConfig();
      const resolvedModels = await resolveModelPaths(config);
      const { sqlite } = createAppDb(config.dbPath);

      try {
        const topN = options.topN ? Number(options.topN) : config.topN;
        const bm25Limit = Math.max(config.rerankTopK * 2, 100);
        const embedLimit = Math.max(config.rerankTopK * 2, 100);

        const bm25Results = bm25Search(sqlite, query, bm25Limit);

        const embedder = await createEmbeddingModel(resolvedModels.embeddingPath);
        let embeddingResults: { id: string; score: number }[] = [];
        try {
          embeddingResults = await embeddingSearch(sqlite, query, embedder, embedLimit);
        } finally {
          await embedder.dispose();
        }

        const mixed = rrfMixer([bm25Results, embeddingResults], config.rrfK);
        const rerankSeed = mixed.slice(0, config.rerankTopK);
        const notes = fetchNotesByIds(sqlite, rerankSeed.map((item) => item.id));
        const noteMap = new Map(notes.map((note) => [note.id, note]));

        const candidates: RerankCandidate[] = rerankSeed
          .map((item) => {
            const note = noteMap.get(item.id);
            if (!note) return null;
            return { id: note.id, title: note.title, text: note.text, score: item.score };
          })
          .filter(Boolean) as RerankCandidate[];

        const reranker = await createReranker(resolvedModels.rerankerPath);
        let reranked: RerankCandidate[] = [];
        try {
          reranked = await rerankCandidates(reranker, query, candidates);
        } finally {
          await reranker.dispose();
        }

        const topResults = selectTopN(reranked, topN);
        const output = options.output.toLowerCase();

        if (output === "json") {
          console.log(
            JSON.stringify(
              {
                query,
                results: topResults.map((item) => ({
                  id: item.id,
                  title: item.title,
                  score: item.score,
                })),
              },
              null,
              2
            )
          );
          return;
        }

        if (output === "text") {
          for (const item of topResults) {
            console.log(`${item.score.toFixed(4)}\t${item.title}\t${item.id}`);
          }
          return;
        }

        for (const item of topResults) {
          console.log(`- ${item.title} (${item.score.toFixed(4)}) — ${item.id}`);
        }
      } finally {
        sqlite.close();
      }
    });
}
