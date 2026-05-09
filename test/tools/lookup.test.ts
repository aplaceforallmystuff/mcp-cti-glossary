// Tests for glossary_lookup — exact term-or-alias match.
import { describe, expect, it } from "vitest";
import { tool as lookupTool } from "../../src/tools/lookup.js";
import { newSeededDb } from "../integration/corpus-fixture.js";

function call(db: Parameters<typeof lookupTool.handle>[0], input: unknown) {
  const parsed = lookupTool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.message);
  return lookupTool.handle(db, parsed.data);
}

function parseResult(result: Awaited<ReturnType<typeof lookupTool.handle>>): {
  count: number;
  results: Array<{ term: string; source: string; category: string; aliases: string[] }>;
} {
  return JSON.parse((result.content?.[0] as { text: string })?.text ?? "{}");
}

describe("glossary_lookup", () => {
  it("resolves a canonical term across all sources", async () => {
    const { db } = newSeededDb();
    const r = parseResult(await call(db, { term: "Salt Typhoon" }));
    expect(r.count).toBeGreaterThanOrEqual(2); // vendor-aliases + misp-galaxy
    const sources = new Set(r.results.map((x) => x.source));
    expect(sources.has("vendor-aliases")).toBe(true);
    expect(sources.has("misp-galaxy")).toBe(true);
  });

  it("resolves an alias to the canonical term", async () => {
    const { db } = newSeededDb();
    // GhostEmperor is an alias of Salt Typhoon in two sources.
    const r = parseResult(await call(db, { term: "GhostEmperor" }));
    expect(r.count).toBeGreaterThanOrEqual(2);
    for (const hit of r.results) {
      expect(hit.term).toBe("Salt Typhoon");
      expect(hit.aliases).toContain("GhostEmperor");
    }
  });

  it("is case-insensitive", async () => {
    const { db } = newSeededDb();
    const a = parseResult(await call(db, { term: "ghostemperor" }));
    const b = parseResult(await call(db, { term: "GhostEmperor" }));
    expect(a.count).toBe(b.count);
  });

  it("constrains by source when source filter provided", async () => {
    const { db } = newSeededDb();
    const r = parseResult(
      await call(db, { term: "Salt Typhoon", source: "vendor-aliases" }),
    );
    expect(r.count).toBe(1);
    expect(r.results[0]!.source).toBe("vendor-aliases");
  });

  it("returns empty count for unknown term (no throw)", async () => {
    const { db } = newSeededDb();
    const r = parseResult(await call(db, { term: "this-does-not-exist" }));
    expect(r.count).toBe(0);
    expect(r.results).toEqual([]);
  });

  it("rejects empty input via zod schema", () => {
    expect(lookupTool.inputSchema.safeParse({ term: "" }).success).toBe(false);
  });
});
