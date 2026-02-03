import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createModelDownloaderMock = vi.fn();
const downloadMock = vi.fn();

vi.mock("node-llama-cpp", () => ({
  createModelDownloader: createModelDownloaderMock,
}));

vi.mock("../../src/utils/paths.js", () => ({
  ensureSniffDirs: vi.fn(),
}));

function buildConfig() {
  return {
    bearDbPath: "/tmp/bear.db",
    dbPath: "/tmp/app.db",
    modelsDir: "/tmp/models",
    models: {
      embeddingUri: "mock-embedding",
      rerankerUri: "mock-reranker",
    },
    rrfK: 60,
    rerankTopK: 50,
    topN: 10,
    embeddingChunkSize: 128,
    embeddingChunkOverlap: 32,
  };
}

describe("resolve models", () => {
  beforeEach(() => {
    vi.resetModules();
    createModelDownloaderMock.mockReset();
    downloadMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bootstrap + resolveEmbeddingPath -> download once per model", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sniff-test-"));
    let counter = 0;
    createModelDownloaderMock.mockImplementation(async () => ({
      download: downloadMock,
    }));
    downloadMock.mockImplementation(async () => {
      const modelPath = path.join(tempDir, `model-${counter}.gguf`);
      counter += 1;
      fs.writeFileSync(modelPath, "x");
      return modelPath;
    });

    const { ensureFirstRunDownloads, resolveEmbeddingPath } = await import(
      "../../src/models/resolve-models.js"
    );
    const config = buildConfig();

    await ensureFirstRunDownloads(config);
    await resolveEmbeddingPath(config);

    expect(createModelDownloaderMock).toHaveBeenCalledTimes(2);
    expect(downloadMock).toHaveBeenCalledTimes(2);
  });

  it("resolveEmbeddingPath repeated -> single download", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sniff-test-"));
    let counter = 0;
    createModelDownloaderMock.mockImplementation(async () => ({
      download: downloadMock,
    }));
    downloadMock.mockImplementation(async () => {
      const modelPath = path.join(tempDir, `model-${counter}.gguf`);
      counter += 1;
      fs.writeFileSync(modelPath, "x");
      return modelPath;
    });

    const { resolveEmbeddingPath } = await import("../../src/models/resolve-models.js");
    const config = buildConfig();

    await resolveEmbeddingPath(config);
    await resolveEmbeddingPath(config);

    expect(createModelDownloaderMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });
});
