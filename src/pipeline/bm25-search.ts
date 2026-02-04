import Database from "better-sqlite3";
import { makeChunkId } from "../utils/chunk-id.js";

export type RankedItem = {
  id: string;
  score: number;
};

export function normalizeBm25Score(raw: number) {
  if (Number.isNaN(raw)) return 0;
  if (raw < 0) return -raw;
  return 1 / (1 + raw);
}

export function bm25Search(sqlite: Database.Database, query: string, limit: number): RankedItem[] {
  const stmt = sqlite.prepare(
    "SELECT note_id as note_id, chunk_index as chunk_index, bm25(notes_fts) as score FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT ?"
  );
  const rows = stmt.all(query, limit);
  return rows.map((row: any) => ({
    id: makeChunkId(String(row.note_id), Number(row.chunk_index)),
    score: normalizeBm25Score(Number(row.score)),
  }));
}
