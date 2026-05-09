// Tests for the ENISA glossary HTML adapter. Verifies the parser handles the
// observed accordion + <strong>TERM</strong>: definition structure and
// degrades gracefully for buckets that contain a plain free-form paragraph.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  enisaGlossaryAdapter,
  parseEnisaGlossary,
} from "../../src/sources/enisa-glossary.js";
import { TermSchema } from "../../src/sources/_adapter.js";

const FIXTURE_PATH = join(
  process.cwd(),
  "test/fixtures/enisa-glossary-sample.html",
);
const html = readFileSync(FIXTURE_PATH, "utf8");

describe("enisaGlossaryAdapter", () => {
  it("has correct metadata", () => {
    expect(enisaGlossaryAdapter.meta.key).toBe("enisa-glossary");
    expect(enisaGlossaryAdapter.meta.license.name).toBe("CC-BY-4.0");
    expect(enisaGlossaryAdapter.meta.homepage).toContain("enisa.europa.eu");
  });

  describe("parseEnisaGlossary()", () => {
    const entries = parseEnisaGlossary(html);

    it("extracts <strong>TERM</strong>: definition paragraphs", () => {
      const ad = entries.find((e) => e.term === "AD");
      expect(ad?.definition).toBe("administrator");
      const ai = entries.find((e) => e.term === "AI");
      expect(ai?.definition).toBe("artificial intelligence");
    });

    it("captures the accordion title's first term when it follows TERM: def", () => {
      const abac = entries.find((e) => e.term === "ABAC");
      expect(abac?.definition).toBe("accrual-based accounting");
      const ca = entries.find((e) => e.term === "CA");
      // Two CA entries exist: 'contract agent' (heading) and 'Certification Authority' (body).
      // Dedupe keeps the longest.
      expect(ca?.definition).toContain("Certification Authority");
    });

    it("captures multi-sentence definitions intact", () => {
      const apt = entries.find((e) => e.term === "APT");
      expect(apt?.definition).toContain("Advanced Persistent Threat");
      expect(apt?.definition).toContain("espionage");
    });

    it("dedupes by lowercased term, keeping the longest definition", () => {
      const lowered = entries.map((e) => e.term.toLowerCase());
      const dupes = lowered.filter((t, i) => lowered.indexOf(t) !== i);
      expect(dupes).toEqual([]);
    });
  });

  describe("normalize()", () => {
    it("emits a regulatory-category Term with a slug externalId", () => {
      const term = enisaGlossaryAdapter.normalize({
        id: "enisa:apt",
        raw: { term: "APT", definition: "Advanced Persistent Threat.", bucket: "ABAC: …" },
      });
      expect(term).toHaveLength(1);
      expect(term[0]!.term).toBe("APT");
      expect(term[0]!.externalId).toBe("apt");
      expect(term[0]!.category).toBe("regulatory");
      expect(() => TermSchema.parse(term[0])).not.toThrow();
    });

    it("returns [] for malformed input", () => {
      expect(enisaGlossaryAdapter.normalize({ id: "x", raw: null })).toEqual([]);
      expect(
        enisaGlossaryAdapter.normalize({
          id: "x",
          raw: { term: "", definition: "x", bucket: "y" },
        }),
      ).toEqual([]);
    });
  });
});
