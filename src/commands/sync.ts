import { Command } from "commander";
import { loadConfig } from "../config/load-config.js";
import { createAppDb } from "../db/sqlite-client.js";
import { readBearNotes } from "../bear/bear-reader.js";
import { hashContent } from "../utils/hash.js";
import { ensureSniffDirs } from "../utils/paths.js";
import { createEmbeddingModel } from "../pipeline/embedding-search.js";
import { resolveEmbeddingPath } from "../models/resolve-models.js";
import { chunkTokens } from "../pipeline/chunking.js";
import {
  advanceCheckpoint,
  compareBearNotes,
  isAfterCheckpoint,
  type SyncCheckpoint,
} from "../sync/checkpoint.js";
import { needsResync } from "../sync/integrity.js";
import { createProgressReporter } from "../utils/progress.js";

const MAX_EMBEDDING_CHUNKS = 1000;
const LAST_SYNC_AT_KEY = "lastSyncAt";
const LAST_SYNC_ID_KEY = "lastSyncId";

function getSyncStateValue(sqlite: ReturnType<typeof createAppDb>["sqlite"], key: string) {
  const row = sqlite
    .prepare("SELECT value FROM sync_state WHERE key = ?")
    .get(key) as { value: string | number } | undefined;
  if (!row) return undefined;
  return String(row.value);
}

function loadCheckpoint(sqlite: ReturnType<typeof createAppDb>["sqlite"]): SyncCheckpoint | undefined {
  const rawAt = getSyncStateValue(sqlite, LAST_SYNC_AT_KEY);
  if (rawAt === undefined) return undefined;
  const parsedAt = Number(rawAt);
  if (!Number.isFinite(parsedAt)) return undefined;
  const rawId = getSyncStateValue(sqlite, LAST_SYNC_ID_KEY);
  return {
    lastSyncAt: parsedAt,
    lastSyncId: rawId ?? "",
  };
}

export function registerSyncCommand(program: Command) {
  program
    .command("sync")
    .description("Sync Bear notes into local RAG index")
    .action(async () => {
      ensureSniffDirs();
      const config = loadConfig();
      const embeddingPath = await resolveEmbeddingPath(config);
      const { sqlite } = createAppDb(config.dbPath);

      try {
        const checkpoint = loadCheckpoint(sqlite);
        const notes = readBearNotes(config.bearDbPath);
        notes.sort(compareBearNotes);

        const existingRows = sqlite.prepare("SELECT id, content_hash as hash FROM notes").all();
        const existingMap = new Map<string, string>(
          existingRows.map((row: any) => [String(row.id), String(row.hash)])
        );
        const embeddingRows = sqlite
          .prepare("SELECT note_id as id, COUNT(*) as count FROM embeddings GROUP BY note_id")
          .all();
        const embeddingsCountMap = new Map<string, number>(
          embeddingRows.map((row: any) => [String(row.id), Number(row.count)])
        );
        const syncPlan = notes.map((note) => {
          const content = `${note.title}\n\n${note.text}`.trim();
          const hash = hashContent(content);
          const hasContent = content.length > 0;
          const existingHash = existingMap.get(note.id);
          const embeddingsCount = embeddingsCountMap.get(note.id) ?? 0;
          const needsProcessing = needsResync({
            contentHash: hash,
            existingHash,
            embeddingsCount,
            hasContent,
          });
          const afterCheckpoint = isAfterCheckpoint(note, checkpoint);
          return { note, hash, hasContent, needsProcessing, afterCheckpoint };
        });
        const candidates = syncPlan.filter(
          (item) => item.afterCheckpoint || item.needsProcessing
        );
        const progress = createProgressReporter({
          total: candidates.length,
          interval: 25,
          label: "sync",
        });

        const embedder = await createEmbeddingModel(embeddingPath);
        const rawChunkSize = Math.max(1, Math.floor(config.embeddingChunkSize));
        const modelContextSize = Number.isFinite(embedder.trainContextSize)
          ? embedder.trainContextSize
          : rawChunkSize;
        const chunkSize = Math.max(1, Math.min(rawChunkSize, modelContextSize));
        const chunkOverlap = Math.max(
          0,
          Math.min(Math.floor(config.embeddingChunkOverlap), Math.max(0, chunkSize - 1))
        );
        let processedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        let currentCheckpoint = checkpoint;

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
          const setSyncStateStmt = sqlite.prepare(
            "INSERT INTO sync_state(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
          );

          const applyNoteTx = sqlite.transaction(
            (
              note: (typeof notes)[number],
              hash: string,
              embeddings: Array<{ buffer: Buffer; dim: number }>,
              checkpointToWrite: SyncCheckpoint
            ) => {
              insertNoteStmt.run(note.id, note.title, note.text, note.updatedAt, hash);
              deleteFtsStmt.run(note.id);
              insertFtsStmt.run(note.id, note.title, note.text);

              deleteEmbeddingsStmt.run(note.id);
              for (let i = 0; i < embeddings.length; i += 1) {
                const { buffer, dim } = embeddings[i];
                insertEmbeddingStmt.run(note.id, i, buffer, dim);
              }

              setSyncStateStmt.run(LAST_SYNC_AT_KEY, String(checkpointToWrite.lastSyncAt));
              setSyncStateStmt.run(LAST_SYNC_ID_KEY, checkpointToWrite.lastSyncId);
            }
          );

          const advanceCheckpointTx = sqlite.transaction((checkpointToWrite: SyncCheckpoint) => {
            setSyncStateStmt.run(LAST_SYNC_AT_KEY, String(checkpointToWrite.lastSyncAt));
            setSyncStateStmt.run(LAST_SYNC_ID_KEY, checkpointToWrite.lastSyncId);
          });

          for (const item of candidates) {
            const { note, hash, hasContent, needsProcessing } = item;
            const nextCheckpoint = advanceCheckpoint(currentCheckpoint, note);
            if (needsProcessing) {
              const content = `${note.title}\n\n${note.text}`.trim();
              const embeddings: Array<{ buffer: Buffer; dim: number }> = [];
              if (hasContent) {
                const tokens = embedder.tokenize(content);
                const chunked = chunkTokens(tokens, chunkSize, chunkOverlap, MAX_EMBEDDING_CHUNKS);
                if (chunked.truncated) {
                  console.warn(
                    `chunking truncated: note=${note.id} tokens=${chunked.totalTokens} chunks=${chunked.chunks.length}`
                  );
                }

                for (let i = 0; i < chunked.chunks.length; i += 1) {
                  const vector = await embedder.embed(chunked.chunks[i]);
                  const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
                  embeddings.push({ buffer, dim: vector.length });
                }
              }

              applyNoteTx(note, hash, embeddings, nextCheckpoint);
              updatedCount += 1;
            } else {
              if (currentCheckpoint !== nextCheckpoint) {
                advanceCheckpointTx(nextCheckpoint);
              }
              skippedCount += 1;
            }

            processedCount += 1;
            progress.update({
              processed: processedCount,
              total: candidates.length,
              updated: updatedCount,
              skipped: skippedCount,
            });
            currentCheckpoint = nextCheckpoint;
          }
        } finally {
          await embedder.dispose();
        }

        progress.finish({
          processed: processedCount,
          total: candidates.length,
          updated: updatedCount,
          skipped: skippedCount,
        });
      } finally {
        sqlite.close();
      }
    });
}
