// Cache path helpers for local glossary storage.
import envPaths from "env-paths";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function getDbPath(): string {
  const paths = envPaths("mcp-cti-glossary", { suffix: "" });
  mkdirSync(paths.data, { recursive: true });
  return join(paths.data, "glossary.db");
}
