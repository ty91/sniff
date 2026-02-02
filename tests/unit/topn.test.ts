import { describe, it, expect } from "vitest";
import { selectTopN } from "../../src/pipeline/topn.js";

describe("selectTopN", () => {
  it("n=0 -> 빈 배열", () => {
    expect(selectTopN([1, 2], 0)).toEqual([]);
  });

  it("n>len -> 전체", () => {
    expect(selectTopN([1, 2], 5)).toEqual([1, 2]);
  });

  it("n<0 -> 빈 배열", () => {
    expect(selectTopN([1, 2], -1)).toEqual([]);
  });
});
