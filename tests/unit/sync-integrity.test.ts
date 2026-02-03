import { describe, it, expect } from "vitest";
import { needsResync } from "../../src/sync/integrity.js";

describe("sync integrity", () => {
  it("해시 불일치 -> 재처리", () => {
    expect(
      needsResync({
        contentHash: "new",
        existingHash: "old",
        embeddingsCount: 1,
        hasContent: true,
      })
    ).toBe(true);
  });

  it("embeddings 0개 + 본문 있음 -> 재처리", () => {
    expect(
      needsResync({
        contentHash: "same",
        existingHash: "same",
        embeddingsCount: 0,
        hasContent: true,
      })
    ).toBe(true);
  });

  it("본문 비어있음 + embeddings 0개 -> 유지", () => {
    expect(
      needsResync({
        contentHash: "same",
        existingHash: "same",
        embeddingsCount: 0,
        hasContent: false,
      })
    ).toBe(false);
  });

  it("해시 동일 + embeddings 정상 -> 유지", () => {
    expect(
      needsResync({
        contentHash: "same",
        existingHash: "same",
        embeddingsCount: 2,
        hasContent: true,
      })
    ).toBe(false);
  });

  it("신규 노트 -> 처리", () => {
    expect(
      needsResync({
        contentHash: "new",
        embeddingsCount: 0,
        hasContent: false,
      })
    ).toBe(true);
  });
});
