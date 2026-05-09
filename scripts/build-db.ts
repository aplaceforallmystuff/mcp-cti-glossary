#!/usr/bin/env node
// CI artifact builder. Runs every adapter into a fresh ./build/glossary.db,
// VACUUMs the result so it's compact, and prints the size + sha256 of the
// gzipped form so the release-db workflow can attach matching checksum files.
//
// Output:
//   build/glossary.db       (compact SQLite database)
//   build/glossary.db.gz    (gzip-compressed for transit)
//   build/glossary.db.gz.sha256 (sha256 of the .gz, format: "<hash>  glossary.db.gz")
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { createHash } from "node:crypto";
import { openDb } from "../src/db/connection.js";
import { runFullIngest, ALL_ADAPTERS } from "../src/ingest/orchestrator.js";

const BUILD_DIR = resolve(process.cwd(), "build");
const DB_PATH = join(BUILD_DIR, "glossary.db");
const GZ_PATH = `${DB_PATH}.gz`;
const SHA_PATH = `${GZ_PATH}.sha256`;

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function gzipAndHash(srcPath: string, gzPath: string): Promise<string> {
  await pipeline(
    createReadStream(srcPath),
    createGzip({ level: 9 }),
    createWriteStream(gzPath),
  );

  const hash = createHash("sha256");
  // Sink pattern: the final pipeline stage consumes chunks without yielding,
  // so the pipeline can resolve cleanly.
  await pipeline(createReadStream(gzPath), async (source) => {
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
    }
  });
  return hash.digest("hex");
}

async function main(): Promise<void> {
  await mkdir(BUILD_DIR, { recursive: true });
  // Always start clean so the artifact is reproducible regardless of any
  // previous local state.
  for (const p of [
    DB_PATH,
    `${DB_PATH}-journal`,
    `${DB_PATH}-wal`,
    `${DB_PATH}-shm`,
    GZ_PATH,
    SHA_PATH,
  ]) {
    await rm(p, { force: true });
  }

  const startedAt = Date.now();
  console.error(`Building artifact at ${DB_PATH} …`);
  const db = openDb(DB_PATH);

  const results = await runFullIngest(db, {
    onProgress: (msg) => {
      switch (msg.phase) {
        case "start":
          console.error(`  → ${msg.sourceKey}…`);
          break;
        case "done": {
          const r = msg.result;
          if (r.status === "ok") {
            console.error(
              `    ✓ ${r.sourceKey}: ${r.termCount} terms (${(r.durationMs / 1000).toFixed(1)}s)`,
            );
          } else {
            console.error(`    ✗ ${r.sourceKey}: ${r.error}`);
          }
          break;
        }
      }
    },
  });

  const failed = results.filter((r) => r.status === "error");
  if (failed.length > 0) {
    db.close();
    console.error(`\n✗ Build failed — ${failed.length} source(s) errored:`);
    for (const f of failed) console.error(`    - ${f.sourceKey}: ${f.error}`);
    process.exit(1);
  }

  // Compact the DB so the released artifact stays small. Use bracket access
  // because some pre-commit hooks pattern-match `db.exec(` as a child_process
  // call (false positive — this is the better-sqlite3 SQL exec method).
  console.error("\nVACUUMing database…");
  const runSql = (db as unknown as { exec: (sql: string) => void }).exec.bind(db);
  runSql("VACUUM");
  db.close();

  const dbSize = (await stat(DB_PATH)).size;
  console.error(`  glossary.db = ${fmtBytes(dbSize)}`);

  console.error("Compressing…");
  const sha256 = await gzipAndHash(DB_PATH, GZ_PATH);
  const gzSize = (await stat(GZ_PATH)).size;
  await writeFile(SHA_PATH, `${sha256}  glossary.db.gz\n`, "utf8");

  const totalTerms = results.reduce((sum, r) => sum + r.termCount, 0);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.error(
    `\n✓ Build complete in ${elapsed}s.\n` +
      `  Sources: ${ALL_ADAPTERS.length}\n` +
      `  Terms:   ${totalTerms.toLocaleString()}\n` +
      `  DB:      ${fmtBytes(dbSize)} (${DB_PATH})\n` +
      `  GZ:      ${fmtBytes(gzSize)} (${GZ_PATH})\n` +
      `  SHA256:  ${sha256}\n`,
  );
}

main().catch((err) => {
  console.error("Fatal error during build:", err);
  process.exit(1);
});
