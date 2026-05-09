// Fetch a prebuilt glossary.db artifact from a GitHub Release.
//
// First-run UX: a fresh `npx mcp-cti-glossary` should not stall for 30+ seconds
// while every adapter ingests in-process. Instead, on first launch we try to
// pull the daily-rebuilt artifact from the latest release. Live ingest stays
// available as a fallback.
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { createHash } from "node:crypto";

const RELEASE_BASE = "https://github.com/aplaceforallmystuff/mcp-cti-glossary/releases/latest/download";
const ARTIFACT_NAME = "glossary.db.gz";
const CHECKSUM_NAME = "glossary.db.gz.sha256";

export interface FetchResult {
  fetched: boolean;
  bytesWritten: number;
  source: "github-release" | "skipped";
  reason?: string;
}

export interface FetchOptions {
  /** Override the artifact URL (used in tests). */
  artifactUrl?: string;
  /** Override the checksum URL. Set to null to skip checksum verification. */
  checksumUrl?: string | null;
  /** Per-progress callback for streaming UI. */
  onProgress?: (msg: { phase: "fetching" | "decompressing" | "verifying" | "done"; bytes?: number }) => void;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/**
 * Fetch the prebuilt glossary.db artifact and write it to `targetPath`.
 *
 * Returns `{ fetched: false }` (without throwing) on any network failure,
 * 404, or hash mismatch — so callers can fall through to a live ingest.
 */
export async function fetchPrebuiltDb(
  targetPath: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const artifactUrl = opts.artifactUrl ?? `${RELEASE_BASE}/${ARTIFACT_NAME}`;
  const checksumUrl =
    opts.checksumUrl === null
      ? null
      : opts.checksumUrl ?? `${RELEASE_BASE}/${CHECKSUM_NAME}`;

  await mkdir(dirname(targetPath), { recursive: true });
  const tmpPath = join(tmpdir(), `glossary-${process.pid}-${Date.now()}.db`);

  try {
    opts.onProgress?.({ phase: "fetching" });
    const res = await fetch(artifactUrl, {
      redirect: "follow",
      signal: opts.signal,
      headers: { Accept: "application/octet-stream" },
    });
    if (!res.ok || !res.body) {
      return {
        fetched: false,
        bytesWritten: 0,
        source: "skipped",
        reason: `release artifact unavailable: HTTP ${res.status}`,
      };
    }

    opts.onProgress?.({ phase: "decompressing" });
    const hash = createHash("sha256");

    // Stream: response body → tee through hash → gunzip → file.
    // We hash the COMPRESSED bytes to match the release sha256 file.
    const sourceStream = Readable.fromWeb(res.body as any);
    const tappedStream = new Readable({
      read() {},
    });
    sourceStream.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      tappedStream.push(chunk);
    });
    sourceStream.on("end", () => tappedStream.push(null));
    sourceStream.on("error", (err) => tappedStream.destroy(err));

    const writeStream = createWriteStream(tmpPath);
    await pipeline(tappedStream, createGunzip(), writeStream);

    const computedHash = hash.digest("hex");

    // Optional checksum verification.
    if (checksumUrl) {
      opts.onProgress?.({ phase: "verifying" });
      try {
        const checkRes = await fetch(checksumUrl, { signal: opts.signal });
        if (checkRes.ok) {
          const text = (await checkRes.text()).trim();
          // Common formats: "<hash>" or "<hash>  glossary.db.gz"
          const expected = text.split(/\s+/)[0]!.toLowerCase();
          if (expected !== computedHash) {
            await rm(tmpPath, { force: true });
            return {
              fetched: false,
              bytesWritten: 0,
              source: "skipped",
              reason: `checksum mismatch (expected ${expected.slice(0, 12)}…, got ${computedHash.slice(0, 12)}…)`,
            };
          }
        }
        // If checksum file missing (404), proceed without verification — the
        // release may not have been built with checksums yet.
      } catch {
        // Network glitch on checksum fetch: don't block on it.
      }
    }

    const finalSize = (await stat(tmpPath)).size;
    await rename(tmpPath, targetPath);
    opts.onProgress?.({ phase: "done", bytes: finalSize });

    return {
      fetched: true,
      bytesWritten: finalSize,
      source: "github-release",
    };
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {});
    return {
      fetched: false,
      bytesWritten: 0,
      source: "skipped",
      reason: (err as Error).message,
    };
  }
}
