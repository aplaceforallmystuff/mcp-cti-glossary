// Ingest orchestrator — shared between scripts/ingest.ts (local one-shot),
// scripts/build-db.ts (CI artifact builder), and src/index.ts (lazy startup
// fetch). Single source of truth for "run all adapters into this database".
import type { Database } from "better-sqlite3";
import type { SourceAdapter } from "../sources/_adapter.js";
import { upsertSource, upsertTerm } from "../db/queries.js";

import { mitreAttackAdapter } from "../sources/mitre-attack.js";
import { ofacSdnAdapter } from "../sources/ofac-sdn.js";
import { vendorAliasesAdapter } from "../sources/vendor-aliases.js";
import { nistAdapter } from "../sources/nist.js";
import { mispGalaxyAdapter } from "../sources/misp-galaxy.js";
import { enisaGlossaryAdapter } from "../sources/enisa-glossary.js";
import { enisaTaxonomyAdapter } from "../sources/enisa-taxonomy.js";
import { jargonFileAdapter } from "../sources/jargon-file.js";

/** Canonical adapter list. Order is stable so the build artifact is reproducible. */
export const ALL_ADAPTERS: SourceAdapter[] = [
  mitreAttackAdapter,
  ofacSdnAdapter,
  vendorAliasesAdapter,
  nistAdapter,
  mispGalaxyAdapter,
  enisaGlossaryAdapter,
  enisaTaxonomyAdapter,
  jargonFileAdapter,
];

export interface IngestResult {
  sourceKey: string;
  status: "ok" | "error";
  termCount: number;
  durationMs: number;
  error?: string;
}

export interface IngestOptions {
  /** Subset of adapters to run. Defaults to ALL_ADAPTERS. */
  adapters?: SourceAdapter[];
  /** Stop on first failure. Defaults to false (continue with other sources). */
  stopOnError?: boolean;
  /** Per-source progress callback. Useful for build-time logging. */
  onProgress?: (
    msg:
      | { phase: "start"; sourceKey: string }
      | { phase: "fetched"; sourceKey: string; docCount: number }
      | { phase: "done"; result: IngestResult },
  ) => void;
}

export async function runFullIngest(
  db: Database,
  opts: IngestOptions = {},
): Promise<IngestResult[]> {
  const adapters = opts.adapters ?? ALL_ADAPTERS;
  const results: IngestResult[] = [];

  for (const adapter of adapters) {
    const start = Date.now();
    opts.onProgress?.({ phase: "start", sourceKey: adapter.meta.key });

    const sourceId = upsertSource(db, {
      sourceKey: adapter.meta.key,
      name: adapter.meta.name,
      homepage: adapter.meta.homepage,
      licenseName: adapter.meta.license.name,
      licenseUrl: adapter.meta.license.url ?? null,
      attribution: adapter.meta.license.attribution,
      lastRefreshedAt: new Date().toISOString(),
      status: "ok",
    });

    let docs: Awaited<ReturnType<SourceAdapter["fetch"]>>;
    try {
      docs = await adapter.fetch();
    } catch (err) {
      const result: IngestResult = {
        sourceKey: adapter.meta.key,
        status: "error",
        termCount: 0,
        durationMs: Date.now() - start,
        error: (err as Error).message,
      };
      upsertSource(db, {
        sourceKey: adapter.meta.key,
        name: adapter.meta.name,
        homepage: adapter.meta.homepage,
        licenseName: adapter.meta.license.name,
        licenseUrl: adapter.meta.license.url ?? null,
        attribution: adapter.meta.license.attribution,
        lastRefreshedAt: new Date().toISOString(),
        status: "error",
      });
      results.push(result);
      opts.onProgress?.({ phase: "done", result });
      if (opts.stopOnError) break;
      continue;
    }

    opts.onProgress?.({
      phase: "fetched",
      sourceKey: adapter.meta.key,
      docCount: docs.length,
    });

    let termCount = 0;
    for (const doc of docs) {
      for (const term of adapter.normalize(doc)) {
        upsertTerm(db, {
          sourceId,
          externalId: term.externalId,
          term: term.term,
          definition: term.definition,
          category: term.category,
          aliases: term.aliases,
          metadata: term.metadata,
        });
        termCount++;
      }
    }

    const result: IngestResult = {
      sourceKey: adapter.meta.key,
      status: "ok",
      termCount,
      durationMs: Date.now() - start,
    };
    results.push(result);
    opts.onProgress?.({ phase: "done", result });
  }

  return results;
}

/** Returns true if the database has at least one term across all sources. */
export function hasIngestedData(db: Database): boolean {
  const row = db.prepare("SELECT COUNT(*) AS c FROM terms").get() as
    | { c: number }
    | undefined;
  return !!row && row.c > 0;
}
