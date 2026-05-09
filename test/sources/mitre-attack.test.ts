// Tests for the MITRE ATT&CK source adapter.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mitreAttackAdapter } from "../../src/sources/mitre-attack.js";
import { TermSchema, RawDoc } from "../../src/sources/_adapter.js";

const FIXTURE_PATH = join(process.cwd(), "test/fixtures/mitre-attack-sample.json");
const sampleBundle = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

describe("mitreAttackAdapter", () => {
  it("has correct metadata", () => {
    expect(mitreAttackAdapter.meta.key).toBe("mitre-attack");
    expect(mitreAttackAdapter.meta.name).toBe("MITRE ATT&CK");
    expect(mitreAttackAdapter.meta.homepage).toContain("attack.mitre.org");
    expect(mitreAttackAdapter.meta.license.name).toBe("Apache-2.0");
  });

  describe("normalize()", () => {
    const rawDocs: RawDoc[] = sampleBundle.objects.map((obj: any) => ({
      id: obj.id,
      raw: obj,
    }));

    it("normalizes an intrusion-set to cti_actor", () => {
      const doc = rawDocs.find((d) => (d.raw as any).type === "intrusion-set")!;
      const terms = mitreAttackAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.category).toBe("cti_actor");
      expect(term.externalId).toBe("G0007");
      expect(term.term).toBe("APT28");
      expect(term.aliases).toContain("Fancy Bear");
      expect(term.aliases).not.toContain("APT28");
      expect(term.definition).toContain("threat group");
      expect(term.metadata.stixType).toBe("intrusion-set");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes malware to cti_software", () => {
      const doc = rawDocs.find((d) => (d.raw as any).type === "malware" && !(d.raw as any).revoked)!;
      const terms = mitreAttackAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.category).toBe("cti_software");
      expect(term.externalId).toBe("S0061");
      expect(term.term).toBe("HDoor");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes a tool to cti_software", () => {
      const doc = rawDocs.find((d) => (d.raw as any).type === "tool")!;
      const terms = mitreAttackAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.category).toBe("cti_software");
      expect(term.externalId).toBe("S0029");
      expect(term.term).toBe("PsExec");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes an attack-pattern to cti_technique", () => {
      const doc = rawDocs.find((d) => (d.raw as any).type === "attack-pattern" && !(d.raw as any).x_mitre_is_subtechnique)!;
      const terms = mitreAttackAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.category).toBe("cti_technique");
      expect(term.externalId).toBe("T1566");
      expect(term.term).toBe("Phishing");
      expect(term.metadata.killChainPhases).toBeDefined();
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes a sub-technique correctly", () => {
      const doc = rawDocs.find((d) => (d.raw as any).type === "attack-pattern" && (d.raw as any).x_mitre_is_subtechnique)!;
      const terms = mitreAttackAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.externalId).toBe("T1566.001");
      expect(term.category).toBe("cti_technique");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("normalizes an x-mitre-tactic to cti_tactic", () => {
      const doc = rawDocs.find((d) => (d.raw as any).type === "x-mitre-tactic")!;
      const terms = mitreAttackAdapter.normalize(doc);
      
      expect(terms).toHaveLength(1);
      const term = terms[0];
      expect(term.category).toBe("cti_tactic");
      expect(term.externalId).toBe("TA0001");
      expect(term.term).toBe("Initial Access");
      
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("skips revoked objects", () => {
      const doc = rawDocs.find((d) => (d.raw as any).revoked)!;
      const terms = mitreAttackAdapter.normalize(doc);
      expect(terms).toHaveLength(0);
    });

    it("skips objects without a MITRE ATT&CK external_id", () => {
      const fakeDoc: RawDoc = {
        id: "identity--123",
        raw: {
          type: "intrusion-set",
          name: "Fake",
          external_references: [{ source_name: "not-attack", external_id: "F123" }],
        },
      };
      const terms = mitreAttackAdapter.normalize(fakeDoc);
      expect(terms).toHaveLength(0);
    });
  });
});
