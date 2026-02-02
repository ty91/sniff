import { describe, it, expect } from "vitest";
import { normalizeBm25Score } from "../../src/pipeline/bm25-search.js";

describe("normalizeBm25Score", () => {
  it("음수 score -> 양수", () => {
    expect(normalizeBm25Score(-2)).toBe(2);
  });

  it("NaN -> 0", () => {
    expect(normalizeBm25Score(Number.NaN)).toBe(0);
  });

  it("양수 score -> 1/(1+score)", () => {
    expect(normalizeBm25Score(3)).toBeCloseTo(0.25, 6);
  });
});
