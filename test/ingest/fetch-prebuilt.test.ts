// Tests for the prebuilt-DB fetcher. Spins up an HTTP server that serves
// a real gzipped fixture, exercises the happy path, the 404 path, and the
// checksum-mismatch path. No network calls.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fetchPrebuiltDb } from "../../src/ingest/fetch-prebuilt.js";

const FIXTURE_DB_BYTES = Buffer.from("SQLite format 3\0fixture-db-bytes-here");
const GZ_BYTES = gzipSync(FIXTURE_DB_BYTES);
const SHA256 = createHash("sha256").update(GZ_BYTES).digest("hex");

let server: Server;
let baseUrl: string;
let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "mcp-cti-glossary-test-"));

  server = createServer((req, res) => {
    const url = req.url ?? "";
    if (url.endsWith("/glossary.db.gz")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(GZ_BYTES);
    } else if (url.endsWith("/glossary.db.gz.sha256")) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`${SHA256}  glossary.db.gz\n`);
    } else if (url.endsWith("/glossary.db.gz.bad-sha256")) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`0000000000000000000000000000000000000000000000000000000000000000  glossary.db.gz\n`);
    } else if (url.endsWith("/missing")) {
      res.writeHead(404);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(workDir, { recursive: true, force: true });
});

describe("fetchPrebuiltDb", () => {
  it("downloads, decompresses, and verifies a valid artifact", async () => {
    const target = join(workDir, "ok.db");
    const result = await fetchPrebuiltDb(target, {
      artifactUrl: `${baseUrl}/glossary.db.gz`,
      checksumUrl: `${baseUrl}/glossary.db.gz.sha256`,
    });
    expect(result.fetched).toBe(true);
    expect(result.source).toBe("github-release");
    const written = await readFile(target);
    expect(written.equals(FIXTURE_DB_BYTES)).toBe(true);
  });

  it("returns fetched:false when the artifact 404s (does not throw)", async () => {
    const target = join(workDir, "missing.db");
    const result = await fetchPrebuiltDb(target, {
      artifactUrl: `${baseUrl}/missing`,
      checksumUrl: null,
    });
    expect(result.fetched).toBe(false);
    expect(result.source).toBe("skipped");
    expect(result.reason).toMatch(/HTTP 404/);
    await expect(stat(target)).rejects.toThrow();
  });

  it("rejects on checksum mismatch and leaves no partial file", async () => {
    const target = join(workDir, "bad-sum.db");
    const result = await fetchPrebuiltDb(target, {
      artifactUrl: `${baseUrl}/glossary.db.gz`,
      checksumUrl: `${baseUrl}/glossary.db.gz.bad-sha256`,
    });
    expect(result.fetched).toBe(false);
    expect(result.reason).toMatch(/checksum mismatch/);
    await expect(stat(target)).rejects.toThrow();
  });

  it("succeeds when checksum is unavailable (404 on checksum URL)", async () => {
    const target = join(workDir, "no-checksum.db");
    const result = await fetchPrebuiltDb(target, {
      artifactUrl: `${baseUrl}/glossary.db.gz`,
      checksumUrl: `${baseUrl}/missing`,
    });
    expect(result.fetched).toBe(true);
  });

  it("can skip checksum verification entirely", async () => {
    const target = join(workDir, "no-verify.db");
    const result = await fetchPrebuiltDb(target, {
      artifactUrl: `${baseUrl}/glossary.db.gz`,
      checksumUrl: null,
    });
    expect(result.fetched).toBe(true);
    const written = await readFile(target);
    expect(written.equals(FIXTURE_DB_BYTES)).toBe(true);
  });
});
