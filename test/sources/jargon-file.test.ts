// Tests for the Jargon File source adapter. Exercises parseJargonFile()
// against a fixture covering: front-matter skipping, section-header skipping,
// pronunciation extraction, multi-POS tokens, bracketed etymology, and
// header-line continuation across newlines.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  jargonFileAdapter,
  parseJargonFile,
} from "../../src/sources/jargon-file.js";
import { TermSchema } from "../../src/sources/_adapter.js";

const FIXTURE_PATH = join(
  process.cwd(),
  "test/fixtures/jargon-file-sample.txt",
);
const fixture = readFileSync(FIXTURE_PATH, "utf8");

describe("jargonFileAdapter", () => {
  it("has correct metadata", () => {
    expect(jargonFileAdapter.meta.key).toBe("jargon-file");
    expect(jargonFileAdapter.meta.homepage).toContain("catb.org/jargon");
    expect(jargonFileAdapter.meta.license.attribution).toMatch(
      /Project Gutenberg/i,
    );
  });

  describe("parseJargonFile()", () => {
    const entries = parseJargonFile(fixture);

    it("skips preamble, section headings, and end-of-eBook marker", () => {
      const names = entries.map((e) => e.term);
      expect(names).not.toContain("Top");
      expect(names).not.toContain("= G =");
    });

    it("returns the lexicon entries it found", () => {
      const names = entries.map((e) => e.term);
      expect(names).toEqual(
        expect.arrayContaining(["green machine", "grep", "foo"]),
      );
    });

    it("extracts pronunciation between slashes", () => {
      const grep = entries.find((e) => e.term === "grep")!;
      expect(grep.pronunciation).toBe("grep");
    });

    it("captures part-of-speech tokens including compound forms", () => {
      const foo = entries.find((e) => e.term === "foo")!;
      expect(foo.partOfSpeech).toMatch(/excl\.,n\.,v\./);
    });

    it("captures bracketed etymology when present", () => {
      const grep = entries.find((e) => e.term === "grep")!;
      expect(grep.etymology).toMatch(/qed\/ed editor idiom/);
    });

    it("handles header-line continuation (Up: line wrapped after =)", () => {
      // grep's header reads:
      //   Node:grep, Next:gribble, Previous:greenbar, Up:=
      //   G =
      // The parser must still pick up the term from the first chunk.
      const grep = entries.find((e) => e.term === "grep");
      expect(grep).toBeDefined();
    });
  });

  describe("normalize()", () => {
    it("emits a cultural-category Term with slug externalId", () => {
      const term = jargonFileAdapter.normalize({
        id: "jargon:grep",
        raw: {
          term: "grep",
          pronunciation: "grep",
          partOfSpeech: "vi.",
          etymology: "from qed/ed",
          definition: "To rapidly scan a file or set of files.",
        },
      });
      expect(term).toHaveLength(1);
      expect(term[0]!.term).toBe("grep");
      expect(term[0]!.externalId).toBe("grep");
      expect(term[0]!.category).toBe("cultural");
      expect(term[0]!.metadata.pronunciation).toBe("grep");
      expect(term[0]!.metadata.etymology).toBe("from qed/ed");
      expect(() => TermSchema.parse(term[0])).not.toThrow();
    });

    it("returns [] for malformed input", () => {
      expect(jargonFileAdapter.normalize({ id: "x", raw: null })).toEqual([]);
      expect(
        jargonFileAdapter.normalize({
          id: "x",
          raw: { term: "", definition: "x" },
        }),
      ).toEqual([]);
      expect(
        jargonFileAdapter.normalize({
          id: "x",
          raw: { term: "x", definition: "" },
        }),
      ).toEqual([]);
    });
  });
});
