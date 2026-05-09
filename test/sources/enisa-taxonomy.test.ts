// Tests for the ENISA threat-taxonomy adapter (sourced from misp-taxonomies).
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { enisaTaxonomyAdapter } from "../../src/sources/enisa-taxonomy.js";
import { TermSchema, RawDoc } from "../../src/sources/_adapter.js";

const FIXTURE_PATH = join(
  process.cwd(),
  "test/fixtures/enisa-taxonomy-sample.json",
);
const machinetag = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

function buildRawDocs(): RawDoc[] {
  const predicateByValue = new Map<string, any>();
  for (const p of machinetag.predicates) predicateByValue.set(p.value, p);
  const out: RawDoc[] = [];
  for (const group of machinetag.values) {
    const predicate = predicateByValue.get(group.predicate);
    if (!predicate) continue;
    for (const entry of group.entry) {
      out.push({
        id: entry.uuid,
        raw: { predicate, entry },
      });
    }
  }
  return out;
}

describe("enisaTaxonomyAdapter", () => {
  it("has correct metadata", () => {
    expect(enisaTaxonomyAdapter.meta.key).toBe("enisa-taxonomy");
    expect(enisaTaxonomyAdapter.meta.license.name).toBe("CC0-1.0");
    expect(enisaTaxonomyAdapter.meta.homepage).toContain(
      "MISP/misp-taxonomies",
    );
  });

  describe("normalize()", () => {
    const docs = buildRawDocs();

    it("normalizes an entry with expanded label as canonical term", () => {
      const fraudDoc = docs.find(
        (d) => (d.raw as any).entry.value === "fraud",
      )!;
      const terms = enisaTaxonomyAdapter.normalize(fraudDoc);
      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe("Fraud");
      expect(term.aliases).toContain("fraud");
      expect(term.definition).toBe("Fraud committed by humans.");
      expect(term.category).toBe("regulatory");
      expect(term.metadata.predicate).toBe("physical-attack");
      expect(term.metadata.machinetag).toBe('enisa:physical-attack="fraud"');
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("preserves the predicate context for downstream disambiguation", () => {
      const malwareDoc = docs.find(
        (d) => (d.raw as any).entry.value === "malware",
      )!;
      const terms = enisaTaxonomyAdapter.normalize(malwareDoc);
      expect(terms).toHaveLength(1);
      expect(terms[0]!.metadata.predicate).toBe("nefarious-activity-abuse");
      expect(terms[0]!.metadata.predicateExpanded).toContain("Nefarious");
    });

    it("uses uuid as externalId when available", () => {
      const theftDoc = docs.find(
        (d) => (d.raw as any).entry.value === "theft",
      )!;
      const terms = enisaTaxonomyAdapter.normalize(theftDoc);
      expect(terms[0]!.externalId).toBe(
        "08cb26f9-259e-56ee-9c51-774136cc8836",
      );
    });

    it("returns [] for malformed input", () => {
      expect(enisaTaxonomyAdapter.normalize({ id: "x", raw: null })).toEqual([]);
      expect(
        enisaTaxonomyAdapter.normalize({
          id: "x",
          raw: { predicate: { value: "p" }, entry: { value: "" } },
        }),
      ).toEqual([]);
    });
  });
});
