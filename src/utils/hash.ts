import crypto from "node:crypto";

export function hashContent(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
