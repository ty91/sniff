import { Command } from "commander";
import { loadConfig } from "../config/load-config.js";
import { createAppDb } from "../db/sqlite-client.js";
import { readBearNotes } from "../bear/bear-reader.js";
import { hashContent } from "../utils/hash.js";
import { ensureSniffDirs } from "../utils/paths.js";
import { createEmbeddingModel } from "../pipeline/embedding-search.js";
import { resolveModelPaths } from "../models/resolve-models.js";
import { chunkTokens } from "../pipeline/chunking.js";

const MAX_EMBEDDING_CHUNKS = 1000;

function getLastSyncAt(sqlite: ReturnType<typeof createAppDb>["sqlite"]) {
  const row = sqlite
    .prepare("SELECT value FROM sync_state WHERE key = 'lastSyncAt'")
    .get();
  if (!row) return undefined;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setLastSyncAt(sqlite: ReturnType<typeof createAppDb>["sqlite"], value: number) {
  sqlite
    .prepare(
      "INSERT INTO sync_state(key, value) VALUES ('lastSyncAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(String(value));
}

export function registerSyncCommand(program: Command) {
  program
    .command("sync")
    .description("Sync Bear notes into local RAG index")
    .action(async () => {
      ensureSniffDirs();
      const config = loadConfig();
      const resolvedModels = await resolveModelPaths(config);
      const { sqlite } = createAppDb(config.dbPath);

      try {
        const lastSyncAt = getLastSyncAt(sqlite);
        const notes = readBearNotes(config.bearDbPath, lastSyncAt);

        const existingRows = sqlite.prepare("SELECT id, content_hash as hash FROM notes").all();
        const existingMap = new Map<string, string>(
          existingRows.map((row: any) => [String(row.id), String(row.hash)])
        );

        const embedder = await createEmbeddingModel(resolvedModels.embeddingPath);
        const rawChunkSize = Math.max(1, Math.floor(config.embeddingChunkSize));
        const modelContextSize = Number.isFinite(embedder.trainContextSize)
          ? embedder.trainContextSize
          : rawChunkSize;
        const chunkSize = Math.max(1, Math.min(rawChunkSize, modelContextSize));
        const chunkOverlap = Math.max(
          0,
          Math.min(Math.floor(config.embeddingChunkOverlap), Math.max(0, chunkSize - 1))
        );
        let updatedCount = 0;
        let latestTimestamp = lastSyncAt ?? 0;

        try {
          const insertNoteStmt = sqlite.prepare(
            "INSERT INTO notes(id, title, text, updated_at, content_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, text = excluded.text, updated_at = excluded.updated_at, content_hash = excluded.content_hash"
          );
          const deleteFtsStmt = sqlite.prepare("DELETE FROM notes_fts WHERE note_id = ?");
          const insertFtsStmt = sqlite.prepare(
            "INSERT INTO notes_fts(note_id, title, text) VALUES (?, ?, ?)"
          );
          const deleteEmbeddingsStmt = sqlite.prepare("DELETE FROM embeddings WHERE note_id = ?");
          const insertEmbeddingStmt = sqlite.prepare(
            "INSERT INTO embeddings(note_id, chunk_index, vector, dim) VALUES (?, ?, ?, ?) ON CONFLICT(note_id, chunk_index) DO UPDATE SET vector = excluded.vector, dim = excluded.dim"
          );

          for (const note of notes) {
            const content = `${note.title}\n\n${note.text}`.trim();
            const hash = hashContent(content);
            if (existingMap.get(note.id) === hash) continue;

            insertNoteStmt.run(note.id, note.title, note.text, note.updatedAt, hash);

            deleteFtsStmt.run(note.id);
            insertFtsStmt.run(note.id, note.title, note.text);

            const tokens = embedder.tokenize(content);
            const chunked = chunkTokens(tokens, chunkSize, chunkOverlap, MAX_EMBEDDING_CHUNKS);
            if (chunked.truncated) {
              console.warn(
                `chunking truncated: note=${note.id} tokens=${chunked.totalTokens} chunks=${chunked.chunks.length}`
              );
            }

            deleteEmbeddingsStmt.run(note.id);
            for (let i = 0; i < chunked.chunks.length; i += 1) {
              const vector = await embedder.embed(chunked.chunks[i]);
              const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
              insertEmbeddingStmt.run(note.id, i, buffer, vector.length);
            }

            updatedCount += 1;
            if (note.updatedAt > latestTimestamp) latestTimestamp = note.updatedAt;
          }
        } finally {
          await embedder.dispose();
        }

        if (typeof latestTimestamp === "number" && latestTimestamp > 0) {
          setLastSyncAt(sqlite, latestTimestamp);
        }

        console.log(`synced: ${updatedCount} notes`);
      } finally {
        sqlite.close();
      }
    });
}
