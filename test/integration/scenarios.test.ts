// End-to-end scenarios from the v1 verification plan.
//
// Each scenario walks the user-visible path: tool name → schema parse → handle()
// → JSON-decoded result. These are the demonstrations that "this MCP server
// works" — if any of these regress, the value proposition is broken.
import { describe, expect, it } from "vitest";
import { tool as disambiguate } from "../../src/tools/disambiguate.js";
import { tool as actor } from "../../src/tools/actor.js";
import { tool as technique } from "../../src/tools/technique.js";
import { tool as search } from "../../src/tools/search.js";
import { tool as stats } from "../../src/tools/stats.js";
import { newSeededDb } from "./corpus-fixture.js";

async function runTool<T>(
  tool: { inputSchema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }; handle: (db: any, input: T) => any },
  db: any,
  input: unknown,
) {
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("schema rejected input");
  const result = await tool.handle(db, parsed.data);
  return JSON.parse((result.content?.[0] as { text: string }).text ?? "{}");
}

describe("v1 verification scenarios", () => {
  it("glossary_disambiguate('NICKEL') returns ≥2 candidates with attribution from multiple sources", async () => {
    const { db } = newSeededDb();
    const r = await runTool(disambiguate, db, { term: "NICKEL" });
    expect(r.totalCandidateCount).toBeGreaterThanOrEqual(2);
    const sources = new Set(r.candidates.map((c: { source: string }) => c.source));
    expect(sources.size).toBeGreaterThanOrEqual(2);
    for (const c of r.candidates) {
      expect(c.attribution).toBeTruthy();
    }
  });

  it("glossary_actor('Salt Typhoon') returns canonical + GhostEmperor + cross-source coverage", async () => {
    const { db } = newSeededDb();
    const r = await runTool(actor, db, { name_or_alias: "Salt Typhoon" });
    expect(r.count).toBeGreaterThanOrEqual(2);

    const aliasSets = r.actors.flatMap((a: { aliases: string[] }) => a.aliases);
    expect(aliasSets).toContain("GhostEmperor");
    expect(aliasSets).toContain("FamousSparrow");

    const sources = new Set(r.actors.map((a: { source: string }) => a.source));
    expect(sources.has("vendor-aliases")).toBe(true);
    expect(sources.has("misp-galaxy")).toBe(true);
  });

  it("glossary_actor('GhostEmperor') resolves the alias to Salt Typhoon", async () => {
    const { db } = newSeededDb();
    const r = await runTool(actor, db, { name_or_alias: "GhostEmperor" });
    for (const a of r.actors) {
      expect(a.canonicalName).toBe("Salt Typhoon");
    }
  });

  it("glossary_actor('APT28') resolves across MITRE + MISP-galaxy with vendor codename", async () => {
    const { db } = newSeededDb();
    const r = await runTool(actor, db, { name_or_alias: "APT28" });
    const sources = new Set(r.actors.map((a: { source: string }) => a.source));
    expect(sources.has("mitre-attack")).toBe(true);
    expect(sources.has("misp-galaxy")).toBe(true);
    // MISP-galaxy entry's canonical name should be Microsoft's codename Strontium.
    const msEntry = r.actors.find((a: { source: string }) => a.source === "misp-galaxy");
    expect(msEntry.canonicalName).toBe("Strontium");
  });

  it("glossary_technique('T1566') returns Phishing with kill chain", async () => {
    const { db } = newSeededDb();
    const r = await runTool(technique, db, { technique_id: "T1566" });
    expect(r.name).toBe("Phishing");
    expect(r.metadata.killChainPhases?.[0].phase_name).toBe("initial-access");
  });

  it("glossary_technique('T1566.001') returns the sub-technique with parent ref", async () => {
    const { db } = newSeededDb();
    const r = await runTool(technique, db, { technique_id: "T1566.001" });
    expect(r.name).toBe("Spearphishing Attachment");
    expect(r.metadata.parentTechnique).toBe("T1566");
  });

  it("glossary_search('phishing', limit=5) ranks across sources", async () => {
    const { db } = newSeededDb();
    const r = await runTool(search, db, { query: "phishing", limit: 5 });
    expect(r.count).toBeGreaterThanOrEqual(3);
    expect(r.results.length).toBeLessThanOrEqual(5);
    // BM25 ranks: lower (more negative) score = better. Verify monotonic order.
    for (let i = 1; i < r.results.length; i++) {
      expect(r.results[i].rank >= r.results[i - 1].rank).toBe(true);
    }
  });

  it("glossary_stats() shows ≥5 sources, all fresh under 30-day threshold", async () => {
    const { db, seed } = newSeededDb();
    const r = await runTool(stats, db, { staleThresholdDays: 30 });
    expect(r.sourceCount).toBe(seed.sourcesSeeded.length);
    expect(r.sourceCount).toBeGreaterThanOrEqual(5);
    expect(r.staleCount).toBe(0);
    expect(r.totalTerms).toBe(seed.totalTerms);
  });
});
