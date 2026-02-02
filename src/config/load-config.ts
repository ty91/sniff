import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_BEAR_DB_PATH,
  DEFAULT_CONFIG_PATH,
  DEFAULT_DB_PATH,
  DEFAULT_MODELS_DIR,
} from "../utils/paths.js";

export type SniffConfig = {
  bearDbPath: string;
  dbPath: string;
  models: {
    embeddingPath?: string;
    rerankerPath?: string;
    embeddingUri?: string;
    rerankerUri?: string;
  };
  rrfK: number;
  rerankTopK: number;
  topN: number;
  modelsDir: string;
  embeddingChunkSize: number;
  embeddingChunkOverlap: number;
};

const DEFAULT_CONFIG = {
  bearDbPath: DEFAULT_BEAR_DB_PATH,
  dbPath: DEFAULT_DB_PATH,
  modelsDir: DEFAULT_MODELS_DIR,
  models: {
    embeddingUri: "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF",
    rerankerUri: "hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf",
  },
  rrfK: 60,
  rerankTopK: 50,
  topN: 10,
  embeddingChunkSize: 512,
  embeddingChunkOverlap: 64,
};

function readJson(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function loadConfig(configPath = DEFAULT_CONFIG_PATH): SniffConfig {
  if (!fs.existsSync(configPath)) {
    writeJson(configPath, DEFAULT_CONFIG);
    return {
      bearDbPath: DEFAULT_BEAR_DB_PATH,
      dbPath: DEFAULT_DB_PATH,
      models: {
        embeddingPath: undefined,
        rerankerPath: undefined,
        embeddingUri: DEFAULT_CONFIG.models.embeddingUri,
        rerankerUri: DEFAULT_CONFIG.models.rerankerUri,
      },
      rrfK: DEFAULT_CONFIG.rrfK,
      rerankTopK: DEFAULT_CONFIG.rerankTopK,
      topN: DEFAULT_CONFIG.topN,
      modelsDir: DEFAULT_CONFIG.modelsDir,
      embeddingChunkSize: DEFAULT_CONFIG.embeddingChunkSize,
      embeddingChunkOverlap: DEFAULT_CONFIG.embeddingChunkOverlap,
    };
  }

  const data = readJson(configPath);
  const models = data.models ?? {};
  const embeddingPath = models.embeddingPath;
  const rerankerPath = models.rerankerPath;

  const resolvedDbPath = data.dbPath ? path.resolve(data.dbPath) : DEFAULT_DB_PATH;
  const resolvedBearDbPath = data.bearDbPath
    ? path.resolve(data.bearDbPath)
    : DEFAULT_BEAR_DB_PATH;

  return {
    bearDbPath: resolvedBearDbPath,
    dbPath: resolvedDbPath,
    models: {
      embeddingPath: embeddingPath ? path.resolve(embeddingPath) : undefined,
      rerankerPath: rerankerPath ? path.resolve(rerankerPath) : undefined,
      embeddingUri: typeof models.embeddingUri === "string" ? models.embeddingUri : undefined,
      rerankerUri: typeof models.rerankerUri === "string" ? models.rerankerUri : undefined,
    },
    rrfK: typeof data.rrfK === "number" ? data.rrfK : 60,
    rerankTopK: typeof data.rerankTopK === "number" ? data.rerankTopK : 50,
    topN: typeof data.topN === "number" ? data.topN : 10,
    modelsDir: data.modelsDir ? path.resolve(data.modelsDir) : DEFAULT_MODELS_DIR,
    embeddingChunkSize:
      typeof data.embeddingChunkSize === "number" ? data.embeddingChunkSize : 512,
    embeddingChunkOverlap:
      typeof data.embeddingChunkOverlap === "number" ? data.embeddingChunkOverlap : 64,
  };
}
