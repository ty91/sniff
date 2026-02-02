import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  updatedAt: integer("updated_at").notNull(),
  contentHash: text("content_hash").notNull(),
});

export const embeddings = sqliteTable("embeddings", {
  noteId: text("note_id").primaryKey(),
  vector: blob("vector").notNull(),
  dim: integer("dim").notNull(),
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
