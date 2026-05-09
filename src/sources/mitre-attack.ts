// MITRE ATT&CK source adapter implementation.
import { SourceAdapter, RawDoc, Term, TermCategory } from "./_adapter.js";

const MITRE_ATTACK_URL = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";

interface StixObject {
  id: string;
  type: string;
  name: string;
  description?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  external_references?: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
  }>;
  aliases?: string[];
  x_mitre_aliases?: string[];
  kill_chain_phases?: Array<{
    kill_chain_name: string;
    phase_name: string;
  }>;
  x_mitre_platforms?: string[];
  x_mitre_domains?: string[];
  x_mitre_is_subtechnique?: boolean;
}

const TYPE_MAP: Record<string, TermCategory> = {
  "intrusion-set": "cti_actor",
  malware: "cti_software",
  tool: "cti_software",
  "attack-pattern": "cti_technique",
  "x-mitre-tactic": "cti_tactic",
};

export const mitreAttackAdapter: SourceAdapter = {
  meta: {
    key: "mitre-attack",
    name: "MITRE ATT&CK",
    homepage: "https://attack.mitre.org/",
    license: {
      name: "Apache-2.0",
      url: "https://github.com/mitre/cti/blob/master/LICENSE.txt",
      attribution: "MITRE ATT&CK®, © The MITRE Corporation, used under Apache License 2.0.",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const response = await fetch(MITRE_ATTACK_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch MITRE ATT&CK bundle: ${response.statusText}`);
    }
    const bundle = (await response.json()) as { objects: StixObject[] };
    
    return bundle.objects
      .filter((obj) => {
        if (!TYPE_MAP[obj.type]) return false;
        if (obj.revoked || obj.x_mitre_deprecated) return false;
        const mitreRef = obj.external_references?.find((r) => r.source_name === "mitre-attack");
        return !!mitreRef?.external_id;
      })
      .map((obj) => ({
        id: obj.id,
        raw: obj,
      }));
  },

  normalize(doc: RawDoc): Term[] {
    const obj = doc.raw as StixObject;
    
    // Safety check (redundant if fetch() is used, but good for direct normalize() calls)
    if (!TYPE_MAP[obj.type] || obj.revoked || obj.x_mitre_deprecated) {
      return [];
    }

    const mitreRef = obj.external_references?.find((r) => r.source_name === "mitre-attack");
    if (!mitreRef?.external_id) {
      return [];
    }

    const category = TYPE_MAP[obj.type];
    const rawAliases = obj.aliases || obj.x_mitre_aliases || [];
    const aliases = [...new Set(rawAliases.filter((a) => a !== obj.name))];

    return [
      {
        externalId: mitreRef.external_id,
        term: obj.name,
        aliases,
        definition: obj.description || "",
        category,
        metadata: {
          stixId: obj.id,
          stixType: obj.type,
          mitreUrl: mitreRef.url,
          killChainPhases: obj.kill_chain_phases,
          platforms: obj.x_mitre_platforms,
          domains: obj.x_mitre_domains,
        },
      },
    ];
  },
};
