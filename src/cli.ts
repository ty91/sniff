#!/usr/bin/env node
import { Command } from "commander";
import { registerSyncCommand } from "./commands/sync.js";
import { registerQueryCommand } from "./commands/query.js";

const program = new Command();
program.name("sniff").description("Local RAG CLI for Bear").version("0.1.0");

registerSyncCommand(program);
registerQueryCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
