import { describe, expect, it } from "vitest";
import { vendorAliasesAdapter } from "../../src/sources/vendor-aliases.js";
import { TermSchema } from "../../src/sources/_adapter.js";

describe("vendor-aliases adapter", () => {
  it("has well-formed metadata", () => {
    expect(vendorAliasesAdapter.meta.key).toBe("vendor-aliases");
    expect(vendorAliasesAdapter.meta.license.name).toBe("MIT");
    expect(vendorAliasesAdapter.meta.license.attribution).toMatch(/cross-vendor/i);
  });

  it("loads and normalizes the shipped YAML", async () => {
    const docs = await vendorAliasesAdapter.fetch();
    expect(docs.length).toBeGreaterThan(0);

    const allTerms = docs.flatMap((doc) => vendorAliasesAdapter.normalize(doc));
    expect(allTerms.length).toBe(docs.length);

    for (const term of allTerms) {
      expect(() => TermSchema.parse(term)).not.toThrow();
      expect(term.term).toBeTruthy();
      expect(term.definition.length).toBeGreaterThan(0);
    }

    const saltTyphoon = allTerms.find((t) => t.externalId === "salt-typhoon");
    expect(saltTyphoon).toBeDefined();
    expect(saltTyphoon?.aliases).toContain("GhostEmperor");
    expect(saltTyphoon?.aliases).toContain("FamousSparrow");
    expect(saltTyphoon?.category).toBe("cti_actor");

    const chenlun = allTerms.find((t) => t.externalId === "chenlun");
    expect(chenlun?.category).toBe("cti_software");

    const nickel = allTerms.find((t) => t.externalId === "nickel-disambiguation");
    expect(nickel?.category).toBe("general");
    expect(nickel?.aliases).toEqual(expect.arrayContaining(["NICKEL ACADEMY", "NICKEL GLADSTONE"]));
  });

  it("returns [] for malformed entries (defensive)", () => {
    expect(vendorAliasesAdapter.normalize({ id: "bad", raw: null })).toEqual([]);
    expect(vendorAliasesAdapter.normalize({ id: "bad", raw: "string" })).toEqual([]);
    expect(
      vendorAliasesAdapter.normalize({
        id: "missing-fields",
        raw: { external_id: "x" },
      })
    ).toEqual([]);
  });

  it("excludes the canonical name from aliases when authors include it", () => {
    const term = vendorAliasesAdapter.normalize({
      id: "test",
      raw: {
        external_id: "test",
        category: "general",
        term: "FOO",
        aliases: ["FOO", "BAR", "BAZ"],
        definition: "A test term.",
      },
    });
    expect(term[0]?.aliases).toEqual(["BAR", "BAZ"]);
  });
});
