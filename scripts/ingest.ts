#!/usr/bin/env node
// Local one-shot ingest: runs all source adapters, populates the SQLite cache.
// Thin wrapper over src/ingest/orchestrator.ts so build-db, refresh, and lazy
// startup all share the same execution path.
import { openDb } from "../src/db/connection.js";
import { runFullIngest, ALL_ADAPTERS } from "../src/ingest/orchestrator.js";

async function main(): Promise<void> {
  const db = openDb();
  console.error("Starting full ingest…");

  const results = await runFullIngest(db, {
    onProgress: (msg) => {
      switch (msg.phase) {
        case "start":
          console.error(`\n→ ${msg.sourceKey} — fetching…`);
          break;
        case "fetched":
          console.error(
            `  fetched ${msg.docCount} docs, normalizing…`,
          );
          break;
        case "done":
          if (msg.result.status === "ok") {
            const elapsed = (msg.result.durationMs / 1000).toFixed(1);
            console.error(
              `  ✓ ${msg.result.sourceKey}: ${msg.result.termCount} terms in ${elapsed}s`,
            );
          } else {
            console.error(`  ✗ ${msg.result.sourceKey}: ${msg.result.error}`);
          }
          break;
      }
    },
  });

  const total = results.reduce((sum, r) => sum + r.termCount, 0);
  const failed = results.filter((r) => r.status === "error").length;
  console.error(
    `\n${failed === 0 ? "✓" : "⚠"} Ingest complete: ${total} total terms across ${ALL_ADAPTERS.length} sources` +
      (failed > 0 ? ` (${failed} failed)` : "") +
      ".",
  );
  db.close();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error during ingest:", err);
  process.exit(1);
});
