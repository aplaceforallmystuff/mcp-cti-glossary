// Tests for glossary_actor — APT-specific lookup with cross-vendor alias resolution.
import { describe, expect, it } from "vitest";
import { tool as actorTool } from "../../src/tools/actor.js";
import { newSeededDb } from "../integration/corpus-fixture.js";

function call(db: Parameters<typeof actorTool.handle>[0], input: unknown) {
  const parsed = actorTool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.message);
  return actorTool.handle(db, parsed.data);
}

function parse(result: Awaited<ReturnType<typeof actorTool.handle>>): {
  count: number;
  actors: Array<{
    canonicalName: string;
    source: string;
    aliases: string[];
    definition: string;
  }>;
} {
  return JSON.parse((result.content?.[0] as { text: string })?.text ?? "{}");
}

describe("glossary_actor", () => {
  it("resolves Salt Typhoon to canonical entries with all aliases", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { name_or_alias: "Salt Typhoon" }));
    expect(r.count).toBeGreaterThanOrEqual(2);

    const vendor = r.actors.find((a) => a.source === "vendor-aliases");
    expect(vendor).toBeDefined();
    expect(vendor!.aliases).toEqual(
      expect.arrayContaining(["GhostEmperor", "FamousSparrow", "UNC2286"]),
    );
  });

  it("resolves alias (GhostEmperor) to the canonical actor", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { name_or_alias: "GhostEmperor" }));
    for (const a of r.actors) {
      expect(a.canonicalName).toBe("Salt Typhoon");
    }
    expect(r.count).toBeGreaterThanOrEqual(2);
  });

  it("provides cross-vendor coverage: APT28 returns MITRE + MISP-galaxy", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { name_or_alias: "APT28" }));
    expect(r.count).toBeGreaterThanOrEqual(2);
    const sources = new Set(r.actors.map((a) => a.source));
    expect(sources.has("mitre-attack")).toBe(true);
    expect(sources.has("misp-galaxy")).toBe(true);
  });

  it("only returns cti_actor category, not other matches", async () => {
    const { db } = newSeededDb();
    // "phishing" has hits in nist, mitre, jargon — none of category cti_actor.
    const result = await call(db, { name_or_alias: "phishing" });
    expect(result.isError).toBe(true);
    const text = (result.content?.[0] as { text: string }).text;
    expect(text).toMatch(/No threat actor found/i);
  });

  it("returns isError for unknown name", async () => {
    const { db } = newSeededDb();
    const result = await call(db, { name_or_alias: "ImaginaryActor99" });
    expect(result.isError).toBe(true);
  });
});
