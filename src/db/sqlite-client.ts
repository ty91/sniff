import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type AppDb = {
  sqlite: Database.Database;
  orm: ReturnType<typeof drizzle>;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  text
);

CREATE TABLE IF NOT EXISTS embeddings (
  note_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  vector BLOB NOT NULL,
  dim INTEGER NOT NULL,
  PRIMARY KEY (note_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function migrateEmbeddings(sqlite: Database.Database) {
  const columns = sqlite.prepare("PRAGMA table_info(embeddings)").all() as Array<{
    name: string;
  }>;
  if (columns.length === 0) return;
  const hasChunkIndex = columns.some((column) => column.name === "chunk_index");
  if (hasChunkIndex) return;

  const migrate = sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE embeddings_v2 (
        note_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        vector BLOB NOT NULL,
        dim INTEGER NOT NULL,
        PRIMARY KEY (note_id, chunk_index)
      );

      INSERT INTO embeddings_v2(note_id, chunk_index, vector, dim)
      SELECT note_id, 0 as chunk_index, vector, dim FROM embeddings;

      DROP TABLE embeddings;
      ALTER TABLE embeddings_v2 RENAME TO embeddings;
    `);
  });

  migrate();
}

export function createAppDb(dbPath: string): AppDb {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(SCHEMA_SQL);
  migrateEmbeddings(sqlite);

  const orm = drizzle(sqlite);
  return { sqlite, orm };
}
