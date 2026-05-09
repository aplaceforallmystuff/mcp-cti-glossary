// Tests for glossary_stats — corpus health.
import { describe, expect, it } from "vitest";
import { tool as statsTool } from "../../src/tools/stats.js";
import { newSeededDb } from "../integration/corpus-fixture.js";

function call(db: Parameters<typeof statsTool.handle>[0], input: unknown = {}) {
  const parsed = statsTool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.message);
  return statsTool.handle(db, parsed.data);
}

function parse(result: Awaited<ReturnType<typeof statsTool.handle>>): {
  totalTerms: number;
  sourceCount: number;
  staleCount: number;
  staleThresholdDays: number;
  sources: Array<{
    sourceKey: string;
    termCount: number;
    isStale: boolean;
    ageDays: number | null;
    status: string;
  }>;
} {
  return JSON.parse((result.content?.[0] as { text: string })?.text ?? "{}");
}

describe("glossary_stats", () => {
  it("reports per-source term counts and total", async () => {
    const { db, seed } = newSeededDb();
    const r = parse(await call(db));
    expect(r.totalTerms).toBe(seed.totalTerms);
    expect(r.sourceCount).toBe(seed.sourcesSeeded.length);
    const keyToCount = new Map(r.sources.map((s) => [s.sourceKey, s.termCount]));
    expect(keyToCount.get("mitre-attack")).toBe(5);
    expect(keyToCount.get("ofac-sdn")).toBe(2);
    expect(keyToCount.get("vendor-aliases")).toBe(3);
  });

  it("flags sources older than threshold as stale", async () => {
    // Seed marks 'mitre-attack' as 60 days old.
    const { db } = newSeededDb({ staleSourceKey: "mitre-attack" });
    const r = parse(await call(db, { staleThresholdDays: 30 }));
    const mitre = r.sources.find((s) => s.sourceKey === "mitre-attack")!;
    expect(mitre.isStale).toBe(true);
    expect(mitre.ageDays).toBeGreaterThanOrEqual(30);
    expect(r.staleCount).toBeGreaterThanOrEqual(1);
  });

  it("does not flag fresh sources as stale", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { staleThresholdDays: 30 }));
    expect(r.staleCount).toBe(0);
    for (const s of r.sources) {
      expect(s.isStale).toBe(false);
    }
  });

  it("reflects the configured threshold in the output", async () => {
    const { db } = newSeededDb();
    const r = parse(await call(db, { staleThresholdDays: 7 }));
    expect(r.staleThresholdDays).toBe(7);
  });

  it("rejects threshold out of range", () => {
    expect(statsTool.inputSchema.safeParse({ staleThresholdDays: 0 }).success).toBe(false);
    expect(statsTool.inputSchema.safeParse({ staleThresholdDays: 366 }).success).toBe(false);
  });
});
