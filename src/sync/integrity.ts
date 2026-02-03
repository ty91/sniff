export type IntegrityCheckInput = {
  contentHash: string;
  existingHash?: string;
  embeddingsCount: number;
  hasContent: boolean;
};

export function needsResync(input: IntegrityCheckInput) {
  if (!input.existingHash) return true;
  if (input.contentHash !== input.existingHash) return true;
  if (input.embeddingsCount === 0 && input.hasContent) return true;
  return false;
}
