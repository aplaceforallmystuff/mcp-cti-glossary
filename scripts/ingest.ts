#!/usr/bin/env node
// Local one-shot ingest: runs all source adapters, populates the SQLite cache.
import { openDb } from "../src/db/connection.js";
import { upsertSource, upsertTerm } from "../src/db/queries.js";
import type { SourceAdapter } from "../src/sources/_adapter.js";
import { mitreAttackAdapter } from "../src/sources/mitre-attack.js";
import { ofacSdnAdapter } from "../src/sources/ofac-sdn.js";
import { vendorAliasesAdapter } from "../src/sources/vendor-aliases.js";

const ADAPTERS: SourceAdapter[] = [
  mitreAttackAdapter,
  ofacSdnAdapter,
  vendorAliasesAdapter,
];

async function ingestSource(db: ReturnType<typeof openDb>, adapter: SourceAdapter): Promise<number> {
  const start = Date.now();
  console.error(`\n→ ${adapter.meta.key} — fetching…`);

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

  let docs;
  try {
    docs = await adapter.fetch();
  } catch (err) {
    console.error(`  ✗ fetch failed: ${(err as Error).message}`);
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
    return 0;
  }

  console.error(`  fetched ${docs.length} docs, normalizing…`);

  let written = 0;
  for (const doc of docs) {
    const terms = adapter.normalize(doc);
    for (const term of terms) {
      upsertTerm(db, {
        sourceId,
        externalId: term.externalId,
        term: term.term,
        definition: term.definition,
        category: term.category,
        aliases: term.aliases,
        metadata: term.metadata,
      });
      written++;
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`  ✓ ${adapter.meta.key}: ${written} terms in ${elapsed}s`);
  return written;
}

async function main(): Promise<void> {
  const db = openDb();
  console.error("Starting full ingest…");

  let total = 0;
  for (const adapter of ADAPTERS) {
    total += await ingestSource(db, adapter);
  }

  console.error(`\n✓ Ingest complete: ${total} total terms across ${ADAPTERS.length} sources.`);
  db.close();
}

main().catch((err) => {
  console.error("Fatal error during ingest:", err);
  process.exit(1);
});
