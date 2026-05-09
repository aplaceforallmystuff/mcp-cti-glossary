// Tests for glossary_search — FTS5 fuzzy ranked search across the corpus.
import { describe, expect, it } from "vitest";
import { tool as searchTool } from "../../src/tools/search.js";
import { newSeededDb } from "../integration/corpus-fixture.js";

function call(db: Parameters<typeof searchTool.handle>[0], input: unknown) {
  const parsed = searchTool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.message);
  return searchTool.handle(db, parsed.data);
}

function parse(result: Awaited<ReturnType<typeof searchTool.handle>>): {
  count: number;
  results: Array<{
    term: string;
    source: string;
    category: string;
    rank: number | null;
    definition: string;
  }>;
} {
  return JSON.parse((result.content?.[0] as { text: string })?.text ?? "{}");
}

describe("glossary_search", () => {
  it("returns ranked matches across all sources for 'phishing'", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { query: "phishing", limit: 10 }));
    expect(r.count).toBeGreaterThanOrEqual(3);
    const sources = new Set(r.results.map((x) => x.source));
    expect(sources.has("nist")).toBe(true);
    expect(sources.has("mitre-attack")).toBe(true);
    expect(sources.has("jargon-file")).toBe(true);
  });

  it("sets rank for FTS5 results (BM25 returns negative scores; lower is better)", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { query: "phishing" }));
    for (const hit of r.results) {
      expect(typeof hit.rank).toBe("number");
    }
    // Results are returned in rank order — ranks should be non-decreasing.
    for (let i = 1; i < r.results.length; i++) {
      expect(r.results[i]!.rank! >= r.results[i - 1]!.rank!).toBe(true);
    }
  });

  it("filters by source when source key provided", async () => {
    const { db } = newSeededDb();
    const r = parse(
      await call(db, { query: "phishing", source: "mitre-attack" }),
    );
    for (const hit of r.results) {
      expect(hit.source).toBe("mitre-attack");
    }
    expect(r.count).toBeGreaterThanOrEqual(1);
  });

  it("filters by category when category provided", async () => {
    const { db } = newSeededDb();
    const r = parse(
      await call(db, { query: "phishing", category: "cti_technique" }),
    );
    for (const hit of r.results) {
      expect(hit.category).toBe("cti_technique");
    }
  });

  it("respects limit parameter", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { query: "phishing", limit: 1 }));
    expect(r.results.length).toBeLessThanOrEqual(1);
  });

  it("returns empty array for queries that match nothing", async () => {
    const { db } = newSeededDb();
    const r = parse(
      await call(db, { query: "completely-fictional-search-string-xyz" }),
    );
    expect(r.count).toBe(0);
    expect(r.results).toEqual([]);
  });

  it("rejects out-of-range limit via zod schema", () => {
    expect(searchTool.inputSchema.safeParse({ query: "x", limit: 0 }).success).toBe(false);
    expect(searchTool.inputSchema.safeParse({ query: "x", limit: 1000 }).success).toBe(false);
  });
});
