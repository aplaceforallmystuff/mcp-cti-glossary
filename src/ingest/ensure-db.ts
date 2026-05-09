// First-run bootstrap: ensure the glossary database is populated before the
// server starts answering tool calls.
//
// Resolution order:
//   1. If the cached DB already has terms → use it.
//   2. Try to download the prebuilt artifact from the latest GitHub Release.
//   3. Fall back to running every adapter live (slow, but always works).
//
// On total failure (no network, no prebuilt artifact, adapters all fail), the
// server still boots — every tool will just return empty results until the
// user runs `glossary_refresh` or `npm run ingest` manually.
import { stat } from "node:fs/promises";
import type { Database } from "better-sqlite3";
import { openDb } from "../db/connection.js";
import { getDbPath } from "../lib/cache-paths.js";
import { fetchPrebuiltDb } from "./fetch-prebuilt.js";
import { runFullIngest, hasIngestedData } from "./orchestrator.js";

export interface EnsureDbResult {
  db: Database;
  source: "cache" | "prebuilt" | "live-ingest" | "empty";
  details?: string;
}

export interface EnsureDbOptions {
  /** Override the DB path (used in tests). */
  dbPath?: string;
  /** Skip the prebuilt fetch step (tests / offline mode). */
  skipPrebuilt?: boolean;
  /** Skip the live ingest fallback. Useful in startup paths where blocking
   *  for ~30s would be worse than starting empty. */
  skipLiveIngest?: boolean;
  /** Logger. Defaults to console.error so output goes to stderr (stdio MCP
   *  servers reserve stdout for the protocol). */
  log?: (msg: string) => void;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDb(
  opts: EnsureDbOptions = {},
): Promise<EnsureDbResult> {
  const log = opts.log ?? ((m: string) => console.error(m));
  const dbPath = opts.dbPath ?? getDbPath();

  // Step 1: cache hit.
  if (await fileExists(dbPath)) {
    const probeDb = openDb(dbPath);
    if (hasIngestedData(probeDb)) {
      return { db: probeDb, source: "cache" };
    }
    probeDb.close();
    // DB exists but is empty — fall through to populate it.
  }

  // Step 2: prebuilt artifact.
  if (!opts.skipPrebuilt) {
    log("[mcp-cti-glossary] First run: fetching prebuilt glossary.db…");
    const result = await fetchPrebuiltDb(dbPath, {
      onProgress: (msg) => {
        if (msg.phase === "done" && msg.bytes) {
          log(
            `[mcp-cti-glossary]   downloaded ${(msg.bytes / 1024 / 1024).toFixed(1)} MB`,
          );
        }
      },
    });
    if (result.fetched) {
      const db = openDb(dbPath);
      if (hasIngestedData(db)) {
        log("[mcp-cti-glossary] Ready (from release artifact).");
        return { db, source: "prebuilt" };
      }
      // Downloaded file exists but is somehow empty — fall through.
      db.close();
    } else {
      log(
        `[mcp-cti-glossary]   prebuilt fetch skipped: ${result.reason ?? "unknown"}`,
      );
    }
  }

  // Step 3: live ingest fallback.
  if (opts.skipLiveIngest) {
    const db = openDb(dbPath);
    return {
      db,
      source: "empty",
      details:
        "Skipped live ingest. Run `npm run ingest` or call glossary_refresh to populate.",
    };
  }

  log("[mcp-cti-glossary] Falling back to live ingest (this takes ~30s)…");
  const db = openDb(dbPath);
  const results = await runFullIngest(db, {
    onProgress: (msg) => {
      if (msg.phase === "start")
        log(`[mcp-cti-glossary]   → ${msg.sourceKey}…`);
    },
  });
  const total = results.reduce((sum, r) => sum + r.termCount, 0);
  const failed = results.filter((r) => r.status === "error");
  if (failed.length > 0) {
    log(
      `[mcp-cti-glossary] Live ingest finished with ${failed.length} failure(s); ${total} terms ingested.`,
    );
  } else {
    log(`[mcp-cti-glossary] Live ingest complete: ${total} terms.`);
  }
  return { db, source: "live-ingest" };
}
