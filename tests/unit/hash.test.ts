import { describe, it, expect } from "vitest";
import { hashContent } from "../../src/utils/hash.js";

describe("hashContent", () => {
  it("같은 입력 -> 같은 해시", () => {
    expect(hashContent("a")).toBe(hashContent("a"));
  });

  it("다른 입력 -> 다른 해시", () => {
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});
