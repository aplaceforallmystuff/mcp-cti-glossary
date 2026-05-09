// Tests for the ingest orchestrator. Uses an in-memory database and a stub
// adapter so we can verify the contract without hitting any network.
import { describe, expect, it, beforeEach } from "vitest";
import DatabaseConstructor, { Database } from "better-sqlite3";
import { applyMigrations } from "../../src/db/migrations.js";
import {
  runFullIngest,
  hasIngestedData,
} from "../../src/ingest/orchestrator.js";
import type { SourceAdapter } from "../../src/sources/_adapter.js";

function newMemoryDb(): Database {
  const db = new DatabaseConstructor(":memory:");
  applyMigrations(db);
  return db;
}

function stubAdapter(
  key: string,
  termCount: number,
  opts: { fail?: boolean } = {},
): SourceAdapter {
  return {
    meta: {
      key,
      name: `Stub ${key}`,
      homepage: "https://example.com",
      license: { name: "MIT", attribution: `${key} stub, MIT` },
    },
    async fetch() {
      if (opts.fail) throw new Error(`stub-${key}-failure`);
      return Array.from({ length: termCount }, (_, i) => ({
        id: `${key}-${i}`,
        raw: { i },
      }));
    },
    normalize(doc) {
      return [
        {
          externalId: doc.id,
          term: `${key}-term-${(doc.raw as { i: number }).i}`,
          aliases: [],
          definition: `Stub definition for ${doc.id}.`,
          category: "general",
          metadata: {},
        },
      ];
    },
  };
}

describe("orchestrator.runFullIngest", () => {
  let db: Database;
  beforeEach(() => {
    db = newMemoryDb();
  });

  it("ingests every adapter and returns per-source results", async () => {
    const results = await runFullIngest(db, {
      adapters: [stubAdapter("a", 3), stubAdapter("b", 2)],
    });
    expect(results.map((r) => r.sourceKey)).toEqual(["a", "b"]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(results[0]!.termCount).toBe(3);
    expect(results[1]!.termCount).toBe(2);
    expect(hasIngestedData(db)).toBe(true);
  });

  it("continues past a failing adapter by default", async () => {
    const results = await runFullIngest(db, {
      adapters: [
        stubAdapter("a", 1),
        stubAdapter("broken", 0, { fail: true }),
        stubAdapter("c", 1),
      ],
    });
    expect(results.map((r) => r.sourceKey)).toEqual(["a", "broken", "c"]);
    const broken = results.find((r) => r.sourceKey === "broken")!;
    expect(broken.status).toBe("error");
    expect(broken.error).toMatch(/stub-broken-failure/);
    expect(results.find((r) => r.sourceKey === "c")?.status).toBe("ok");
  });

  it("stops on first failure when stopOnError is true", async () => {
    const results = await runFullIngest(db, {
      adapters: [
        stubAdapter("a", 1),
        stubAdapter("broken", 0, { fail: true }),
        stubAdapter("never-reached", 1),
      ],
      stopOnError: true,
    });
    expect(results.map((r) => r.sourceKey)).toEqual(["a", "broken"]);
  });

  it("emits start/fetched/done progress events in order", async () => {
    const events: string[] = [];
    await runFullIngest(db, {
      adapters: [stubAdapter("a", 2)],
      onProgress: (msg) => events.push(msg.phase),
    });
    expect(events).toEqual(["start", "fetched", "done"]);
  });

  it("hasIngestedData reports false on a freshly migrated db", () => {
    expect(hasIngestedData(db)).toBe(false);
  });
});
