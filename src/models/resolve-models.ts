import fs from "node:fs";
import { createModelDownloader } from "node-llama-cpp";
import type { SniffConfig } from "../config/load-config.js";
import { ensureSniffDirs } from "../utils/paths.js";

export type ResolvedModels = {
  embeddingPath: string;
  rerankerPath: string;
};

const downloadCache = new Map<string, Promise<string>>();

function fileExists(filePath: string) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function downloadCacheKey(params: { uri: string; dirPath: string; label: string }) {
  return `${params.label}|${params.dirPath}|${params.uri}`;
}

async function ensureModelFile(params: {
  uri: string;
  dirPath: string;
  label: string;
}) {
  ensureSniffDirs();
  const cacheKey = downloadCacheKey(params);
  const cached = downloadCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const downloadPromise = (async () => {
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
  })();

  downloadCache.set(cacheKey, downloadPromise);
  try {
    return await downloadPromise;
  } catch (error) {
    downloadCache.delete(cacheKey);
    throw error;
  }
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

export async function resolveEmbeddingPath(config: SniffConfig): Promise<string> {
  return resolveModelPath({
    modelPath: config.models.embeddingPath,
    modelUri: config.models.embeddingUri,
    dirPath: config.modelsDir,
    label: "embedding",
  });
}

export async function resolveRerankerPath(config: SniffConfig): Promise<string> {
  return resolveModelPath({
    modelPath: config.models.rerankerPath,
    modelUri: config.models.rerankerUri,
    dirPath: config.modelsDir,
    label: "reranker",
  });
}

export async function resolveModelPaths(config: SniffConfig): Promise<ResolvedModels> {
  const embeddingPath = await resolveEmbeddingPath(config);
  const rerankerPath = await resolveRerankerPath(config);
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
