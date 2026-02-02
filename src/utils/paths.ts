import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const SNIFF_DIR = path.join(os.homedir(), ".sniff");
export const DEFAULT_DB_PATH = path.join(SNIFF_DIR, "sniff.db");
export const DEFAULT_MODELS_DIR = path.join(SNIFF_DIR, "models");
export const DEFAULT_CONFIG_PATH = path.join(SNIFF_DIR, "config.json");
export const DEFAULT_BEAR_DB_PATH = path.join(
  os.homedir(),
  "Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite"
);

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureSniffDirs() {
  ensureDir(SNIFF_DIR);
  ensureDir(DEFAULT_MODELS_DIR);
}
