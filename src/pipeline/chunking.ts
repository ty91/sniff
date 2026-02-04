import type { Token } from "node-llama-cpp";

export type ChunkTokensResult = {
  chunks: Token[][];
  chunkStarts: number[];
  totalTokens: number;
  truncated: boolean;
  chunkSize: number;
  overlap: number;
};

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function chunkTokens(
  tokens: Token[],
  chunkSize: number,
  overlap: number,
  maxChunks: number
): ChunkTokensResult {
  const totalTokens = tokens.length;
  const safeChunkSize = clampInt(chunkSize, 1, Number.MAX_SAFE_INTEGER);
  const safeOverlap = clampInt(overlap, 0, Math.max(0, safeChunkSize - 1));
  const safeMaxChunks = clampInt(maxChunks, 1, Number.MAX_SAFE_INTEGER);
  const step = Math.max(1, safeChunkSize - safeOverlap);

  if (totalTokens === 0) {
    return {
      chunks: [tokens],
      chunkStarts: [0],
      totalTokens,
      truncated: false,
      chunkSize: safeChunkSize,
      overlap: safeOverlap,
    };
  }

  if (totalTokens <= safeChunkSize) {
    return {
      chunks: [tokens],
      chunkStarts: [0],
      totalTokens,
      truncated: false,
      chunkSize: safeChunkSize,
      overlap: safeOverlap,
    };
  }

  const chunks: Token[][] = [];
  const chunkStarts: number[] = [];
  let truncated = false;
  let index = 0;

  while (index < totalTokens) {
    if (chunks.length >= safeMaxChunks) {
      truncated = true;
      break;
    }

    chunks.push(tokens.slice(index, index + safeChunkSize));
    chunkStarts.push(index);
    if (index + safeChunkSize >= totalTokens) break;
    index += step;
  }

  return {
    chunks,
    chunkStarts,
    totalTokens,
    truncated,
    chunkSize: safeChunkSize,
    overlap: safeOverlap,
  };
}
