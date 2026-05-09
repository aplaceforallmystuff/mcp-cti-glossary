// Tests for the MISP Galaxy adapter — exercises normalize() against fixtures
// for both clusters (threat-actor, microsoft-activity-group).
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mispGalaxyAdapter } from "../../src/sources/misp-galaxy.js";
import { TermSchema, RawDoc } from "../../src/sources/_adapter.js";

const TA_PATH = join(process.cwd(), "test/fixtures/misp-galaxy-threat-actor.json");
const MS_PATH = join(process.cwd(), "test/fixtures/misp-galaxy-microsoft.json");
const taCluster = JSON.parse(readFileSync(TA_PATH, "utf8"));
const msCluster = JSON.parse(readFileSync(MS_PATH, "utf8"));

function wrap(cluster: any, value: any, key: "threat-actor" | "microsoft-activity-group"): RawDoc {
  return {
    id: `${key}:${value.uuid}`,
    raw: {
      value,
      cluster: key,
      clusterMeta: {
        uuid: cluster.uuid,
        name: cluster.name,
        source: cluster.source,
        version: cluster.version,
      },
    },
  };
}

describe("mispGalaxyAdapter", () => {
  it("has correct metadata", () => {
    expect(mispGalaxyAdapter.meta.key).toBe("misp-galaxy");
    expect(mispGalaxyAdapter.meta.homepage).toBe(
      "https://github.com/MISP/misp-galaxy",
    );
    expect(mispGalaxyAdapter.meta.license.name).toBe("CC0-1.0");
  });

  describe("normalize()", () => {
    it("normalizes a threat-actor with synonyms and country meta", () => {
      const doc = wrap(taCluster, taCluster.values[0], "threat-actor");
      const terms = mispGalaxyAdapter.normalize(doc);
      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe("PLA Unit 61398");
      expect(term.category).toBe("cti_actor");
      expect(term.aliases).toEqual(
        expect.arrayContaining(["APT1", "Comment Crew", "Comment Panda"]),
      );
      expect(term.aliases).not.toContain("PLA Unit 61398");
      expect(term.metadata.country).toBe("CN");
      expect(term.metadata.cluster).toBe("threat-actor");
      expect(term.metadata.relatedUuids).toEqual([
        "00000000-0000-0000-0000-000000000001",
      ]);
      expect(() => TermSchema.parse(term)).not.toThrow();
    });

    it("preserves Microsoft codename as canonical with vendor synonyms", () => {
      const doc = wrap(msCluster, msCluster.values[0], "microsoft-activity-group");
      const terms = mispGalaxyAdapter.normalize(doc);
      expect(terms).toHaveLength(1);
      const term = terms[0]!;
      expect(term.term).toBe("Strontium");
      expect(term.aliases).toEqual(
        expect.arrayContaining([
          "Fancy Bear",
          "APT28",
          "Sofacy",
          "Forest Blizzard",
        ]),
      );
      expect(term.metadata.cluster).toBe("microsoft-activity-group");
    });

    it("falls back to a generated definition when description is missing", () => {
      const doc = wrap(taCluster, taCluster.values[2], "threat-actor"); // NoSynonymsActor with description
      const terms = mispGalaxyAdapter.normalize(doc);
      expect(terms).toHaveLength(1);
      expect(terms[0]!.aliases).toEqual([]);
      expect(terms[0]!.definition).toContain("Tests minimal");
    });

    it("returns [] for malformed input", () => {
      expect(mispGalaxyAdapter.normalize({ id: "x", raw: null })).toEqual([]);
      expect(
        mispGalaxyAdapter.normalize({
          id: "x",
          raw: { value: { uuid: "u" }, cluster: "threat-actor", clusterMeta: {} },
        }),
      ).toEqual([]);
    });
  });
});
