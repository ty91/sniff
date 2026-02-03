import type { BearNote } from "../bear/bear-reader.js";

export type SyncCheckpoint = {
  lastSyncAt: number;
  lastSyncId: string;
};

export function compareBearNotes(a: BearNote, b: BearNote) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.id.localeCompare(b.id);
}

export function isAfterCheckpoint(note: BearNote, checkpoint?: SyncCheckpoint) {
  if (!checkpoint) return true;
  if (note.updatedAt > checkpoint.lastSyncAt) return true;
  if (note.updatedAt < checkpoint.lastSyncAt) return false;
  return note.id > checkpoint.lastSyncId;
}

export function advanceCheckpoint(current: SyncCheckpoint | undefined, note: BearNote): SyncCheckpoint {
  if (!current) {
    return { lastSyncAt: note.updatedAt, lastSyncId: note.id };
  }
  if (note.updatedAt > current.lastSyncAt) {
    return { lastSyncAt: note.updatedAt, lastSyncId: note.id };
  }
  if (note.updatedAt === current.lastSyncAt && note.id > current.lastSyncId) {
    return { lastSyncAt: note.updatedAt, lastSyncId: note.id };
  }
  return current;
}
