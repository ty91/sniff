#!/usr/bin/env node
import { Command } from "commander";
import { registerSyncCommand } from "./commands/sync.js";
import { registerQueryCommand } from "./commands/query.js";
import { loadConfig } from "./config/load-config.js";
import { ensureFirstRunDownloads } from "./models/resolve-models.js";

const program = new Command();
program.name("sniff").description("Local RAG CLI for Bear").version("0.1.0");

registerSyncCommand(program);
registerQueryCommand(program);

async function bootstrap() {
  const config = loadConfig();
  await ensureFirstRunDownloads(config);
}

bootstrap()
  .then(() => program.parseAsync(process.argv))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
