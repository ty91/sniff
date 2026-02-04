import { describe, it, expect } from "vitest";
import { chunkTokens } from "../../src/pipeline/chunking.js";

describe("chunkTokens", () => {
  it("chunkStarts with overlap", () => {
    const tokens = Array.from({ length: 10 }, (_, index) => index);
    const result = chunkTokens(tokens, 4, 1, 10);
    expect(result.chunkStarts).toEqual([0, 3, 6]);
    expect(result.chunks.length).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("chunkStarts for short input", () => {
    const tokens = [1, 2, 3];
    const result = chunkTokens(tokens, 10, 0, 10);
    expect(result.chunkStarts).toEqual([0]);
    expect(result.chunks.length).toBe(1);
  });
});
