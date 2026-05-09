// Tests for the NIST CSRC Glossary adapter — exercises normalize() against
// a representative fixture covering the schema corner cases observed in the
// live glossary-export.json (definitions: null, embedded HTML, abbrSyn).
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { nistAdapter } from "../../src/sources/nist.js";
import { TermSchema, RawDoc } from "../../src/sources/_adapter.js";

const FIXTURE_PATH = join(process.cwd(), "test/fixtures/nist-sample.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  parentTerms: unknown[];
};

describe("nistAdapter", () => {
  it("has correct metadata", () => {
    expect(nistAdapter.meta.key).toBe("nist");
    expect(nistAdapter.meta.name).toContain("NIST");
    expect(nistAdapter.meta.homepage).toBe("https://csrc.nist.gov/glossary");
    expect(nistAdapter.meta.license.name).toBe("Public Domain");
  });

  describe("normalize()", () => {
    const rawDocs: RawDoc[] = fixture.parentTerms.map(
      (pt: unknown, idx: number) => ({
        id: `nist-${idx}`,
        raw: pt,
      }),
    );

    it("normalizes a simple term with one definition", () => {
      const doc = rawDocs[0]!; // (KEM) ciphertext
      const terms = nistAdapter.normalize(doc);

      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe("(KEM) ciphertext");
      expect(term.externalId).toBe("kem_ciphertext");
      expect(term.definition).toContain("encapsulation");
      expect(term.category).toBe("general");
      expect(term.aliases).toEqual([]);
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("emits a redirect term when definitions is null but abbrSyn exists", () => {
      const doc = rawDocs[1]!; // .csv (definitions: null, abbrSyn → Comma-Separated Value)
      const terms = nistAdapter.normalize(doc);
      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe(".csv");
      expect(term.definition).toBe("See: Comma-Separated Value.");
      expect(term.aliases).toContain("Comma-Separated Value");
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("returns [] when both definitions and abbrSyn are missing", () => {
      const terms = nistAdapter.normalize({
        id: "x",
        raw: { term: "stub", definitions: null },
      });
      expect(terms).toEqual([]);
    });

    it("collapses multiple definitions: first canonical, rest in metadata", () => {
      const doc = rawDocs[2]!; // phishing — 2 definitions
      const terms = nistAdapter.normalize(doc);
      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe("phishing");
      expect(term.definition).toContain("acquire sensitive data");
      const additional = term.metadata.additionalDefinitions as string[];
      expect(additional).toHaveLength(1);
      expect(additional[0]).toContain("Tricking individuals");
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("strips HTML from term and definition", () => {
      const doc = rawDocs[3]!; // <em>(n, e)</em>
      const terms = nistAdapter.normalize(doc);
      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe("(n, e)");
      expect(term.term).not.toContain("<");
      expect(term.definition).toBe("RSA public key.");
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("captures abbrSyn entries as aliases", () => {
      const synonymOnly = nistAdapter.normalize({
        id: "x",
        raw: {
          term: "Comma-Separated Value",
          link: "https://csrc.nist.gov/glossary/term/comma_separated_value",
          abbrSyn: [{ text: "CSV" }, { text: ".csv" }],
          definitions: [{ text: "A simple text format for tabular data." }],
        },
      });
      expect(synonymOnly).toHaveLength(1);
      expect(synonymOnly[0]!.aliases).toEqual(
        expect.arrayContaining(["CSV", ".csv"]),
      );
    });

    it("returns [] for malformed input", () => {
      expect(nistAdapter.normalize({ id: "x", raw: null })).toEqual([]);
      expect(nistAdapter.normalize({ id: "x", raw: { term: "" } })).toEqual([]);
      expect(
        nistAdapter.normalize({
          id: "x",
          raw: { term: "no defs", definitions: [] },
        }),
      ).toEqual([]);
    });
  });
});
