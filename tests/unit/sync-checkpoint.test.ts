import { describe, it, expect } from "vitest";
import type { BearNote } from "../../src/bear/bear-reader.js";
import {
  advanceCheckpoint,
  compareBearNotes,
  isAfterCheckpoint,
  type SyncCheckpoint,
} from "../../src/sync/checkpoint.js";

const makeNote = (id: string, updatedAt: number): BearNote => ({
  id,
  title: "",
  text: "",
  updatedAt,
});

describe("sync checkpoint", () => {
  it("updatedAt -> id 순서로 정렬", () => {
    const notes = [makeNote("b", 2), makeNote("a", 2), makeNote("c", 1)];
    notes.sort(compareBearNotes);
    expect(notes.map((note) => note.id)).toEqual(["c", "a", "b"]);
  });

  it("checkpoint 이후만 통과", () => {
    const checkpoint: SyncCheckpoint = { lastSyncAt: 100, lastSyncId: "b" };
    expect(isAfterCheckpoint(makeNote("a", 99), checkpoint)).toBe(false);
    expect(isAfterCheckpoint(makeNote("b", 100), checkpoint)).toBe(false);
    expect(isAfterCheckpoint(makeNote("c", 100), checkpoint)).toBe(true);
    expect(isAfterCheckpoint(makeNote("a", 101), checkpoint)).toBe(true);
  });

  it("checkpoint는 앞으로만 이동", () => {
    const checkpoint: SyncCheckpoint = { lastSyncAt: 100, lastSyncId: "b" };
    expect(advanceCheckpoint(checkpoint, makeNote("a", 99))).toEqual(checkpoint);
    expect(advanceCheckpoint(checkpoint, makeNote("a", 100))).toEqual(checkpoint);
    expect(advanceCheckpoint(checkpoint, makeNote("c", 100))).toEqual({
      lastSyncAt: 100,
      lastSyncId: "c",
    });
    expect(advanceCheckpoint(checkpoint, makeNote("a", 101))).toEqual({
      lastSyncAt: 101,
      lastSyncId: "a",
    });
  });
});
