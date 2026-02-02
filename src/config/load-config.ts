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
};

const DEFAULT_CONFIG = {
  bearDbPath: DEFAULT_BEAR_DB_PATH,
  dbPath: DEFAULT_DB_PATH,
  modelsDir: DEFAULT_MODELS_DIR,
  models: {
    embeddingUri: "",
    rerankerUri: "",
  },
  rrfK: 60,
  rerankTopK: 50,
  topN: 10,
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
    throw new Error(`config created at ${configPath}. Fill models.embeddingUri / models.rerankerUri and retry.`);
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
  };
}
