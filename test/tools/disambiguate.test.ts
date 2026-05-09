// Tests for glossary_disambiguate — the headline tool. Exercises the exact-then-fuzzy
// merge path against the shared test corpus.
import { describe, expect, it } from "vitest";
import { tool as disambiguateTool } from "../../src/tools/disambiguate.js";
import { newSeededDb } from "../integration/corpus-fixture.js";

function callTool(db: Parameters<typeof disambiguateTool.handle>[0], input: unknown) {
  const parsed = disambiguateTool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.message);
  return disambiguateTool.handle(db, parsed.data);
}

function parseResult(result: Awaited<ReturnType<typeof disambiguateTool.handle>>): {
  exactMatchCount: number;
  totalCandidateCount: number;
  candidates: Array<{
    rank: number;
    term: string;
    source: string;
    category: string;
    matchKind: "exact" | "fuzzy";
    aliases: string[];
    definition: string;
  }>;
} {
  const text = (result.content?.[0] as { text: string })?.text ?? "";
  return JSON.parse(text);
}

describe("glossary_disambiguate", () => {
  it("returns multi-source candidates for an ambiguous term (NICKEL)", async () => {
    const { db } = newSeededDb();
    const result = await callTool(db, { term: "NICKEL" });
    const parsed = parseResult(result);

    // vendor-aliases NICKEL disambiguation entry + OFAC NICKEL ELECTRONICS LTD (alias match)
    expect(parsed.exactMatchCount).toBeGreaterThanOrEqual(1);
    expect(parsed.totalCandidateCount).toBeGreaterThanOrEqual(2);

    const sources = new Set(parsed.candidates.map((c) => c.source));
    expect(sources).toContain("vendor-aliases");
    // Fuzzy fallback should surface the OFAC entry too (term contains NICKEL).
    const hasOfac = parsed.candidates.some((c) => c.source === "ofac-sdn");
    expect(hasOfac).toBe(true);
  });

  it("returns exact + fuzzy results for 'phishing' across multiple sources", async () => {
    const { db } = newSeededDb();
    const result = await callTool(db, { term: "phishing" });
    const parsed = parseResult(result);

    const sources = new Set(parsed.candidates.map((c) => c.source));
    // NIST + jargon-file have term="phishing" exactly; MITRE T1566 has term="Phishing".
    expect(sources.has("nist")).toBe(true);
    expect(sources.has("jargon-file")).toBe(true);
    expect(sources.has("mitre-attack")).toBe(true);

    // Categories should span multiple values, proving cross-source coverage.
    const cats = new Set(parsed.candidates.map((c) => c.category));
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });

  it("ranks exact matches before fuzzy ones", async () => {
    const { db } = newSeededDb();
    const result = await callTool(db, { term: "NICKEL" });
    const parsed = parseResult(result);

    // First-N candidates should all be matchKind=exact, then fuzzy.
    let sawFuzzy = false;
    for (const c of parsed.candidates) {
      if (c.matchKind === "fuzzy") sawFuzzy = true;
      else if (sawFuzzy) {
        throw new Error(`Saw exact after fuzzy at rank ${c.rank}`);
      }
    }
  });

  it("dedupes overlapping (sourceKey, externalId) pairs from exact + fuzzy", async () => {
    const { db } = newSeededDb();
    const result = await callTool(db, { term: "Salt Typhoon" });
    const parsed = parseResult(result);

    const keys = parsed.candidates.map((c) => `${c.source}:${c.term}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("attaches attribution to every candidate", async () => {
    const { db } = newSeededDb();
    const result = await callTool(db, { term: "Phishing" });
    const parsed = parseResult(result);
    for (const c of parsed.candidates) {
      expect(typeof (c as unknown as { attribution: string }).attribution).toBe("string");
      expect((c as unknown as { attribution: string }).attribution.length).toBeGreaterThan(0);
    }
  });

  it("returns empty candidate list for unknown terms (does not throw)", async () => {
    const { db } = newSeededDb();
    const result = await callTool(db, { term: "completely-fictional-term-xyz" });
    const parsed = parseResult(result);
    expect(parsed.totalCandidateCount).toBe(0);
    expect(parsed.exactMatchCount).toBe(0);
    expect(parsed.candidates).toEqual([]);
  });
});
