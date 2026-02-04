import { describe, it, expect } from "vitest";
import { makeChunkId, parseChunkId } from "../../src/utils/chunk-id.js";

describe("chunk id", () => {
  it("makeChunkId", () => {
    expect(makeChunkId("note-1", 2)).toBe("note-1:2");
  });

  it("parseChunkId valid", () => {
    expect(parseChunkId("note-1:2")).toEqual({ noteId: "note-1", chunkIndex: 2 });
  });

  it("parseChunkId invalid", () => {
    expect(parseChunkId("note-1")).toBeNull();
    expect(parseChunkId("note-1:")).toBeNull();
    expect(parseChunkId(":2")).toBeNull();
    expect(parseChunkId("note-1:-1")).toBeNull();
    expect(parseChunkId("note-1:2.5")).toBeNull();
  });
});
