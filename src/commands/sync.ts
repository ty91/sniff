import { Command } from "commander";
import { loadConfig } from "../config/load-config.js";
import { createAppDb } from "../db/sqlite-client.js";
import { readBearNotes } from "../bear/bear-reader.js";
import { hashContent } from "../utils/hash.js";
import { ensureSniffDirs } from "../utils/paths.js";
import { createEmbeddingModel } from "../pipeline/embedding-search.js";
import { resolveModelPaths } from "../models/resolve-models.js";

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
        let updatedCount = 0;
        let latestTimestamp = lastSyncAt ?? 0;

        try {
          for (const note of notes) {
            const content = `${note.title}\n\n${note.text}`.trim();
            const hash = hashContent(content);
            if (existingMap.get(note.id) === hash) continue;

            sqlite
              .prepare(
                "INSERT INTO notes(id, title, text, updated_at, content_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, text = excluded.text, updated_at = excluded.updated_at, content_hash = excluded.content_hash"
              )
              .run(note.id, note.title, note.text, note.updatedAt, hash);

            sqlite.prepare("DELETE FROM notes_fts WHERE note_id = ?").run(note.id);
            sqlite
              .prepare("INSERT INTO notes_fts(note_id, title, text) VALUES (?, ?, ?)")
              .run(note.id, note.title, note.text);

            const vector = await embedder.embed(content);
            const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
            sqlite
              .prepare(
                "INSERT INTO embeddings(note_id, vector, dim) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET vector = excluded.vector, dim = excluded.dim"
              )
              .run(note.id, buffer, vector.length);

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
