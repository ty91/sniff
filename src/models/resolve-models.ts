import fs from "node:fs";
import { createModelDownloader } from "node-llama-cpp";
import type { SniffConfig } from "../config/load-config.js";
import { ensureSniffDirs } from "../utils/paths.js";

export type ResolvedModels = {
  embeddingPath: string;
  rerankerPath: string;
};

function fileExists(filePath: string) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

async function ensureModelFile(params: {
  uri: string;
  dirPath: string;
  label: string;
}) {
  ensureSniffDirs();
  const downloader = await createModelDownloader({
    modelUri: params.uri,
    dirPath: params.dirPath,
    showCliProgress: true,
  });

  const modelPath = await downloader.download();
  if (!fileExists(modelPath)) {
    throw new Error(`${params.label} download failed: ${modelPath}`);
  }
  return modelPath;
}

function requireModelUri(uri: unknown, label: string) {
  if (typeof uri !== "string" || uri.trim().length === 0) {
    throw new Error(`${label} modelUri is required when modelPath is not set`);
  }
  return uri;
}

async function resolveModelPath(params: {
  modelPath?: string;
  modelUri?: string;
  dirPath: string;
  label: string;
}) {
  if (params.modelPath && fileExists(params.modelPath)) {
    return params.modelPath;
  }

  const uri = requireModelUri(params.modelUri, params.label);
  return ensureModelFile({ uri, dirPath: params.dirPath, label: params.label });
}

export async function resolveModelPaths(config: SniffConfig): Promise<ResolvedModels> {
  const embeddingPath = await resolveModelPath({
    modelPath: config.models.embeddingPath,
    modelUri: config.models.embeddingUri,
    dirPath: config.modelsDir,
    label: "embedding",
  });

  const rerankerPath = await resolveModelPath({
    modelPath: config.models.rerankerPath,
    modelUri: config.models.rerankerUri,
    dirPath: config.modelsDir,
    label: "reranker",
  });

  return { embeddingPath, rerankerPath };
}

export async function ensureFirstRunDownloads(config: SniffConfig): Promise<void> {
  if (!config.models.embeddingPath && config.models.embeddingUri) {
    await ensureModelFile({
      uri: config.models.embeddingUri,
      dirPath: config.modelsDir,
      label: "embedding",
    });
  }

  if (!config.models.rerankerPath && config.models.rerankerUri) {
    await ensureModelFile({
      uri: config.models.rerankerUri,
      dirPath: config.modelsDir,
      label: "reranker",
    });
  }
}
