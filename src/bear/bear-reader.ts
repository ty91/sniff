import Database from "better-sqlite3";
import fs from "node:fs";

export type BearNote = {
  id: string;
  title: string;
  text: string;
  updatedAt: number;
};

const BEAR_EPOCH_MS = Date.UTC(2001, 0, 1);

function isLikelyCoreDataSeconds(value: number) {
  return value > 1e7 && value < 1e10;
}

function normalizeBearTimestamp(value: unknown) {
  if (typeof value !== "number") return 0;
  if (value > 1e12) return value;
  if (isLikelyCoreDataSeconds(value)) return BEAR_EPOCH_MS + value * 1000;
  return value;
}

function toBearTimestamp(sinceMs: number, useCoreDataSeconds: boolean) {
  if (!useCoreDataSeconds) return sinceMs;
  return Math.max(0, Math.floor((sinceMs - BEAR_EPOCH_MS) / 1000));
}

export function readBearNotes(dbPath: string, sinceMs?: number): BearNote[] {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Bear DB not found: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ZSFNOTE'")
      .get();
    if (!table) {
      throw new Error("Bear DB table ZSFNOTE not found. Unsupported Bear DB schema.");
    }

    const columns = db.prepare("PRAGMA table_info(ZSFNOTE)").all();
    const columnNames = new Set(columns.map((col: any) => col.name));

    const hasTrash = columnNames.has("ZTRASHED");
    const hasMod = columnNames.has("ZMODIFICATIONDATE");

    let useCoreDataSeconds = false;
    if (hasMod) {
      const sample = db
        .prepare("SELECT ZMODIFICATIONDATE as mod FROM ZSFNOTE WHERE ZMODIFICATIONDATE IS NOT NULL LIMIT 1")
        .get() as { mod?: number } | undefined;
      if (sample && typeof sample.mod === "number" && isLikelyCoreDataSeconds(sample.mod)) {
        useCoreDataSeconds = true;
      }
    }

    const where: string[] = [];
    const params: Array<string | number> = [];
    if (hasTrash) {
      where.push("ZTRASHED = 0");
    }
    if (hasMod && typeof sinceMs === "number") {
      where.push("ZMODIFICATIONDATE >= ?");
      params.push(toBearTimestamp(sinceMs, useCoreDataSeconds));
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `
      SELECT
        ZUNIQUEIDENTIFIER as id,
        ZTITLE as title,
        ZTEXT as text,
        ZMODIFICATIONDATE as modified
      FROM ZSFNOTE
      ${whereClause}
    `;

    const rows = db.prepare(sql).all(...params);
    return rows
      .map((row: any) => {
        const updatedAt = normalizeBearTimestamp(row.modified);
        return {
          id: String(row.id),
          title: row.title ? String(row.title) : "",
          text: row.text ? String(row.text) : "",
          updatedAt,
        };
      })
      .filter((note: BearNote) => note.id.length > 0);
  } finally {
    db.close();
  }
}
