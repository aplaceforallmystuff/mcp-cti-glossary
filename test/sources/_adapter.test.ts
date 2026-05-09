import { describe, expect, it } from "vitest";
import {
  SourceAdapter,
  SourceMetadataSchema,
  TermSchema,
} from "../../src/sources/_adapter.js";

describe("SourceAdapter contract", () => {
  it("allows a minimal source adapter implementation", async () => {
    const adapter: SourceAdapter = {
      meta: {
        key: "stub-source",
        name: "Stub Source",
        homepage: "https://example.com",
        license: {
          name: "MIT",
          attribution: "Stub Source, MIT",
        },
      },
      async fetch() {
        return [{ id: "stub-1", raw: { title: "Stub Term" } }];
      },
      normalize(doc) {
        return [
          {
            externalId: doc.id,
            term: "Stub Term",
            aliases: ["Stub Alias"],
            definition: "A term emitted by a test adapter.",
            category: "general",
            metadata: { sourceShape: "object" },
          },
        ];
      },
    };

    const docs = await adapter.fetch();
    expect(adapter.normalize(docs[0])).toEqual([
      expect.objectContaining({ externalId: "stub-1", term: "Stub Term" }),
    ]);
  });

  it("validates source metadata at runtime", () => {
    const valid = {
      key: "nist",
      name: "NIST Glossary",
      homepage: "https://csrc.nist.gov/glossary",
      license: {
        name: "Public Domain",
        url: "https://www.nist.gov/open/license",
        attribution: "NIST Glossary, Public Domain",
      },
    };

    expect(SourceMetadataSchema.parse(valid)).toEqual(valid);
    expect(() =>
      SourceMetadataSchema.parse({
        ...valid,
        key: "",
      })
    ).toThrow();
    expect(() =>
      SourceMetadataSchema.parse({
        ...valid,
        license: { name: "MIT" },
      })
    ).toThrow();
  });

  it("validates normalized terms at runtime", () => {
    const valid = {
      externalId: "G0099",
      term: "APT-C-36",
      aliases: ["Blind Eagle"],
      definition: "A cyber threat actor tracked in ATT&CK.",
      category: "cti_actor",
      metadata: { stixType: "intrusion-set" },
    };

    expect(TermSchema.parse(valid)).toEqual(valid);
    expect(() =>
      TermSchema.parse({
        ...valid,
        category: "source_specific_category",
      })
    ).toThrow();
    expect(() =>
      TermSchema.parse({
        ...valid,
        metadata: null,
      })
    ).toThrow();
  });
});
