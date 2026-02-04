export type ChunkRef = {
  noteId: string;
  chunkIndex: number;
};

export function makeChunkId(noteId: string, chunkIndex: number) {
  return `${noteId}:${chunkIndex}`;
}

export function parseChunkId(id: string): ChunkRef | null {
  const separatorIndex = id.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex === id.length - 1) return null;
  const noteId = id.slice(0, separatorIndex);
  const rawIndex = id.slice(separatorIndex + 1);
  const chunkIndex = Number(rawIndex);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
  return { noteId, chunkIndex };
}
