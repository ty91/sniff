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
    embeddingPath: string;
    rerankerPath: string;
  };
  rrfK: number;
  rerankTopK: number;
  topN: number;
  modelsDir: string;
};

function readJson(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export function loadConfig(configPath = DEFAULT_CONFIG_PATH): SniffConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`config not found: ${configPath}`);
  }

  const data = readJson(configPath);
  const models = data.models ?? {};
  const embeddingPath = models.embeddingPath;
  const rerankerPath = models.rerankerPath;

  if (!embeddingPath || !rerankerPath) {
    throw new Error("models.embeddingPath and models.rerankerPath are required in config");
  }

  const resolvedDbPath = data.dbPath ? path.resolve(data.dbPath) : DEFAULT_DB_PATH;
  const resolvedBearDbPath = data.bearDbPath
    ? path.resolve(data.bearDbPath)
    : DEFAULT_BEAR_DB_PATH;

  return {
    bearDbPath: resolvedBearDbPath,
    dbPath: resolvedDbPath,
    models: {
      embeddingPath: path.resolve(embeddingPath),
      rerankerPath: path.resolve(rerankerPath),
    },
    rrfK: typeof data.rrfK === "number" ? data.rrfK : 60,
    rerankTopK: typeof data.rerankTopK === "number" ? data.rerankTopK : 50,
    topN: typeof data.topN === "number" ? data.topN : 10,
    modelsDir: data.modelsDir ? path.resolve(data.modelsDir) : DEFAULT_MODELS_DIR,
  };
}
