import { describe, it, expect } from "vitest";
import { createVerboseLogger } from "../../src/utils/verbose.js";

describe("verbose logger", () => {
  it("disabled -> no output", () => {
    const lines: string[] = [];
    const logger = createVerboseLogger(false, (line) => lines.push(line));
    logger("step", { count: 1 });
    expect(lines).toEqual([]);
  });

  it("enabled -> formats line", () => {
    const lines: string[] = [];
    const logger = createVerboseLogger(true, (line) => lines.push(line));
    logger("bm25", { count: 2, limit: 10 });
    expect(lines).toEqual(["[verbose] bm25 count=2 limit=10"]);
  });
});
