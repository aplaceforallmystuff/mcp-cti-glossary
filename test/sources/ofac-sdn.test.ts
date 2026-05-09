// Tests for the OFAC SDN source adapter.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { XMLParser } from "fast-xml-parser";
import { ofacSdnAdapter } from "../../src/sources/ofac-sdn.js";
import { TermSchema, RawDoc } from "../../src/sources/_adapter.js";

const FIXTURE_PATH = join(process.cwd(), "test/fixtures/ofac-sdn-sample.xml");
const fixtureXml = readFileSync(FIXTURE_PATH, "utf8");

describe("ofacSdnAdapter", () => {
  it("has correct metadata", () => {
    expect(ofacSdnAdapter.meta.key).toBe("ofac-sdn");
    expect(ofacSdnAdapter.meta.name).toBe("OFAC SDN");
    expect(ofacSdnAdapter.meta.homepage).toContain("ofac.treasury.gov");
    expect(ofacSdnAdapter.meta.license.name).toBe("Public Domain");
  });

  describe("normalize()", () => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: true,
      trimValues: true,
    });
    const parsed = parser.parse(fixtureXml);
    const sdnEntries = Array.isArray(parsed.sdnList.sdnEntry) 
      ? parsed.sdnList.sdnEntry 
      : [parsed.sdnList.sdnEntry];
    
    const rawDocs: RawDoc[] = sdnEntries.map((entry: any) => ({
      id: String(entry.uid),
      raw: entry,
    }));

    it("normalizes a simple Entity", () => {
      const doc = rawDocs.find(d => d.id === "36")!;
      const terms = ofacSdnAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.category).toBe("regulatory");
      expect(term.externalId).toBe("36");
      expect(term.term).toBe("AEROCARIBBEAN AIRLINES");
      expect(term.definition).toBe("Sanctioned entity. Programs: CUBA. Locations: Havana, Cuba.");
      expect(term.metadata.sdnType).toBe("Entity");
      expect(term.metadata.programs).toEqual(["CUBA"]);
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes an Entity with multiple aliases and programs", () => {
      const doc = rawDocs.find(d => d.id === "100")!;
      const terms = ofacSdnAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.term).toBe("GLOBAL TRADING CO.");
      expect(term.aliases).toContain("GTC");
      expect(term.aliases).toContain("TRADING WORLDWIDE");
      expect(term.definition).toContain("Programs: IRAN, SYRIA");
      expect(term.definition).toContain("Locations: Dubai, United Arab Emirates, Abu Dhabi, United Arab Emirates");
      expect(term.metadata.akaCount).toBe(2);
      expect(term.metadata.strongAkaCount).toBe(1);
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes an Individual with firstName and lastName", () => {
      const doc = rawDocs.find(d => d.id === "200")!;
      const terms = ofacSdnAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.term).toBe("JOHN DOE");
      expect(term.metadata.sdnType).toBe("Individual");
      expect(term.aliases).toContain("JONNY D.");
      expect(term.aliases).toContain("JOHANNES");
      expect(term.definition).toBe("Sanctioned individual. Programs: SDGT, RUSSIA-EO14024. Locations: Moscow, Russia.");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes a Vessel with vesselInfo", () => {
      const doc = rawDocs.find(d => d.id === "300")!;
      const terms = ofacSdnAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.term).toBe("OCEAN STAR");
      expect(term.metadata.sdnType).toBe("Vessel");
      expect(term.metadata.vesselInfo).toBeDefined();
      expect((term.metadata.vesselInfo as any).vesselType).toBe("Cargo");
      expect(term.definition).toBe("Sanctioned vessel. Programs: NORTH KOREA.");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes an Aircraft with minimal data", () => {
      const doc = rawDocs.find(d => d.id === "400")!;
      const terms = ofacSdnAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.term).toBe("AERO-55");
      expect(term.metadata.sdnType).toBe("Aircraft");
      expect(term.definition).toBe("Sanctioned aircraft. Programs: VENEZUELA.");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("includes remarks in definition if short enough", () => {
      const doc = rawDocs.find(d => d.id === "500")!;
      const terms = ofacSdnAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.definition).toContain("Remarks: This is a test remark for the OFAC SDN list.");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("deduplicates aliases and excludes the canonical term", () => {
      const entryWithDupes = {
        uid: "999",
        lastName: "DUPE ENTITY",
        sdnType: "Entity",
        akaList: {
          aka: [
            { lastName: "ALIAS 1" },
            { lastName: "ALIAS 1" }, // Duplicate
            { lastName: "DUPE ENTITY" } // Same as term
          ]
        }
      };
      
      const terms = ofacSdnAdapter.normalize({ id: "999", raw: entryWithDupes });
      expect(terms[0].aliases).toEqual(["ALIAS 1"]);
    });

    it("handles missing programList and addressList gracefully", () => {
      const minimalEntry = {
        uid: "888",
        lastName: "MINIMAL",
        sdnType: "Entity"
      };
      
      const terms = ofacSdnAdapter.normalize({ id: "888", raw: minimalEntry });
      expect(terms[0].definition).toBe("Sanctioned entity.");
      expect(terms[0].metadata.programs).toEqual([]);
      expect(terms[0].metadata.addresses).toEqual([]);
    });
  });
});
