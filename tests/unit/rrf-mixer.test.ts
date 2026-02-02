import { describe, it, expect } from "vitest";
import { rrfMixer } from "../../src/pipeline/rrf-mixer.js";

describe("rrfMixer", () => {
  it("합산 점수로 정렬", () => {
    const listA = [
      { id: "a", score: 1 },
      { id: "b", score: 1 },
      { id: "c", score: 1 },
    ];
    const listB = [
      { id: "b", score: 1 },
      { id: "a", score: 1 },
      { id: "d", score: 1 },
    ];

    const result = rrfMixer([listA, listB], 60);
    const ids = result.map((item) => item.id);

    expect(new Set(ids.slice(0, 2))).toEqual(new Set(["a", "b"]));
    expect(ids).toContain("d");
  });

  it("빈 리스트 처리", () => {
    const result = rrfMixer([[], [{ id: "x", score: 1 }]], 60);
    expect(result).toEqual([{ id: "x", score: 1 / 61 }]);
  });
});
