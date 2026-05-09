// Reusable test corpus shared across tool + integration tests.
//
// Designed to exercise every cross-source scenario that matters at v1:
//   - "NICKEL" multi-source collision (vendor-aliases disambiguation entry +
//     OFAC sanctioned entity with NICKEL in name)
//   - "APT28" cross-vendor coverage (MITRE intrusion-set + MISP-galaxy
//     Microsoft Strontium codename pointing at the same actor)
//   - Salt Typhoon → all aliases (vendor-aliases entry with GhostEmperor /
//     FamousSparrow / UNC2286 alias resolution)
//   - "phishing" definition competition across MITRE ATT&CK, NIST, ENISA,
//     and the Jargon File (different categories, FTS5 ranking matters)
//   - T1566 + T1566.001 technique parent/sub-technique relationship
//
// Uses the same upsertSource / upsertTerm path as production ingest so the
// DB shape is byte-identical to a real ingest output.
import DatabaseConstructor, { type Database } from "better-sqlite3";
import { applyMigrations } from "../../src/db/migrations.js";
import { upsertSource, upsertTerm } from "../../src/db/queries.js";
import type { TermCategory } from "../../src/sources/_adapter.js";

interface SeedTerm {
  externalId: string;
  term: string;
  aliases: string[];
  definition: string;
  category: TermCategory;
  metadata?: Record<string, unknown>;
}

interface SeedSource {
  sourceKey: string;
  name: string;
  homepage: string;
  licenseName: string;
  attribution: string;
  /** Hours into the past for last_refreshed_at. Defaults to 1h ago.
   *  Tests that exercise stale-flag logic override this. */
  ageHours?: number;
  terms: SeedTerm[];
}

const NOW = Date.now();

const SEED: SeedSource[] = [
  // ────────────────────────────── MITRE ATT&CK ───────────────────────────
  {
    sourceKey: "mitre-attack",
    name: "MITRE ATT&CK",
    homepage: "https://attack.mitre.org/",
    licenseName: "Apache-2.0",
    attribution: "MITRE ATT&CK®, © The MITRE Corporation, Apache-2.0.",
    terms: [
      {
        externalId: "T1566",
        term: "Phishing",
        aliases: [],
        definition:
          "Adversaries may send phishing messages to gain access to victim systems.",
        category: "cti_technique",
        metadata: {
          stixType: "attack-pattern",
          killChainPhases: [
            { kill_chain_name: "mitre-attack", phase_name: "initial-access" },
          ],
          platforms: ["Linux", "Windows", "macOS"],
        },
      },
      {
        externalId: "T1566.001",
        term: "Spearphishing Attachment",
        aliases: [],
        definition:
          "Adversaries may send spearphishing emails with a malicious attachment to gain access.",
        category: "cti_technique",
        metadata: {
          stixType: "attack-pattern",
          parentTechnique: "T1566",
          isSubtechnique: true,
        },
      },
      {
        externalId: "G0007",
        term: "APT28",
        aliases: ["Fancy Bear", "Sofacy", "Sednit", "STRONTIUM"],
        definition:
          "APT28 is a threat group attributed to Russia's GRU, active since at least 2004.",
        category: "cti_actor",
        metadata: { stixType: "intrusion-set" },
      },
      {
        externalId: "S0061",
        term: "HDoor",
        aliases: [],
        definition:
          "HDoor is a malware family used by some intrusion sets.",
        category: "cti_software",
        metadata: { stixType: "malware" },
      },
      {
        externalId: "TA0001",
        term: "Initial Access",
        aliases: [],
        definition:
          "The adversary is trying to get into your network via initial access vectors.",
        category: "cti_tactic",
        metadata: { stixType: "x-mitre-tactic" },
      },
    ],
  },

  // ────────────────────────────── OFAC SDN ────────────────────────────────
  {
    sourceKey: "ofac-sdn",
    name: "OFAC SDN",
    homepage:
      "https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists",
    licenseName: "Public Domain",
    attribution: "OFAC SDN, US Department of the Treasury (Public Domain).",
    terms: [
      {
        externalId: "ofac-100",
        term: "AEROCARIBBEAN AIRLINES",
        aliases: ["AEROCARIBBEAN"],
        definition: "Sanctioned entity. Programs: CUBA. Locations: Havana, Cuba.",
        category: "regulatory",
        metadata: { sdnType: "Entity", programs: ["CUBA"] },
      },
      {
        externalId: "ofac-555",
        term: "NICKEL ELECTRONICS LTD",
        aliases: ["NICKEL ELECTRONICS"],
        definition: "Sanctioned entity. Programs: SDGT. Locations: Dubai, UAE.",
        category: "regulatory",
        metadata: { sdnType: "Entity", programs: ["SDGT"] },
      },
    ],
  },

  // ─────────────────────── Vendor aliases (cross-walk) ────────────────────
  {
    sourceKey: "vendor-aliases",
    name: "Vendor Aliases (cross-walk)",
    homepage: "https://github.com/aplaceforallmystuff/mcp-cti-glossary",
    licenseName: "MIT",
    attribution: "Hand-curated cross-vendor naming, mcp-cti-glossary (MIT).",
    terms: [
      {
        externalId: "salt-typhoon",
        term: "Salt Typhoon",
        aliases: ["GhostEmperor", "FamousSparrow", "UNC2286", "Earth Estries", "RedMike"],
        definition:
          "Chinese state-aligned cluster targeting telecoms; Microsoft codename. Overlaps with GhostEmperor (Kaspersky) and FamousSparrow (ESET).",
        category: "cti_actor",
        metadata: { primary_naming_vendor: "Microsoft", mitre_status: "present_no_aliases" },
      },
      {
        externalId: "nickel-disambiguation",
        term: "NICKEL",
        aliases: ["NICKEL ACADEMY", "NICKEL GLADSTONE"],
        definition:
          "NICKEL is overloaded across security vocabularies. Microsoft codename for Ke3chang/APT15 (now Nylon Typhoon).",
        category: "general",
        metadata: { designation_type: "disambiguation" },
      },
      {
        externalId: "bri",
        term: "Belt and Road Initiative",
        aliases: ["BRI", "One Belt One Road", "OBOR"],
        definition: "PRC strategic infrastructure investment programme launched in 2013.",
        category: "general",
        metadata: { designation_type: "strategic_programme" },
      },
    ],
  },

  // ───────────────────────────────── NIST ─────────────────────────────────
  {
    sourceKey: "nist",
    name: "NIST CSRC Glossary",
    homepage: "https://csrc.nist.gov/glossary",
    licenseName: "Public Domain",
    attribution: "NIST CSRC Glossary, US Dept of Commerce (Public Domain).",
    terms: [
      {
        externalId: "phishing",
        term: "phishing",
        aliases: [],
        definition:
          "A technique for attempting to acquire sensitive data through fraudulent solicitation in email or web.",
        category: "general",
        metadata: { sources: [{ text: "NIST SP 800-12 Rev. 1" }] },
      },
      {
        externalId: "kem_ciphertext",
        term: "(KEM) ciphertext",
        aliases: [],
        definition: "A bit string that is produced by encapsulation.",
        category: "general",
        metadata: {},
      },
    ],
  },

  // ─────────────────────── MISP Galaxy (cross-vendor) ─────────────────────
  {
    sourceKey: "misp-galaxy",
    name: "MISP Galaxy (threat-actor + Microsoft activity groups)",
    homepage: "https://github.com/MISP/misp-galaxy",
    licenseName: "CC0-1.0",
    attribution: "MISP Galaxy, dual CC0-1.0 / BSD-2-Clause.",
    terms: [
      {
        externalId: "44444444-4444-4444-4444-444444444444",
        term: "Strontium",
        aliases: ["Fancy Bear", "APT28", "Sofacy", "Forest Blizzard"],
        definition:
          "Microsoft's pre-2023 codename for the Russian state-sponsored cluster also tracked as Fancy Bear / APT28.",
        category: "cti_actor",
        metadata: { cluster: "microsoft-activity-group", country: "RU" },
      },
      {
        externalId: "22222222-2222-2222-2222-222222222222",
        term: "Salt Typhoon",
        aliases: ["GhostEmperor", "FamousSparrow", "UNC2286"],
        definition: "Microsoft codename for a PRC-aligned telecoms cluster.",
        category: "cti_actor",
        metadata: { cluster: "threat-actor", country: "CN" },
      },
    ],
  },

  // ───────────────────────────── ENISA glossary ───────────────────────────
  {
    sourceKey: "enisa-glossary",
    name: "ENISA Glossary",
    homepage: "https://www.enisa.europa.eu/media/media-press-kits/enisa-glossary",
    licenseName: "CC-BY-4.0",
    attribution: "ENISA Glossary, used under CC-BY-4.0.",
    terms: [
      {
        externalId: "apt",
        term: "APT",
        aliases: [],
        definition:
          "Advanced Persistent Threat. Cyber threats, in particular Internet-enabled espionage using a variety of intelligence-gathering techniques.",
        category: "regulatory",
        metadata: { bucket: "ABAC: …" },
      },
      {
        externalId: "ai",
        term: "AI",
        aliases: [],
        definition: "artificial intelligence",
        category: "regulatory",
        metadata: {},
      },
    ],
  },

  // ──────────────────────── ENISA threat taxonomy ─────────────────────────
  {
    sourceKey: "enisa-taxonomy",
    name: "ENISA Threat Taxonomy (MISP)",
    homepage: "https://github.com/MISP/misp-taxonomies/tree/main/enisa",
    licenseName: "CC0-1.0",
    attribution: "ENISA threat taxonomy via misp-taxonomies, CC0-1.0.",
    terms: [
      {
        externalId: "1646019b-2bc3-5f0e-bcf1-ad5ef86184d7",
        term: "Fraud",
        aliases: ["fraud"],
        definition: "Fraud committed by humans.",
        category: "regulatory",
        metadata: { predicate: "physical-attack" },
      },
    ],
  },

  // ─────────────────────────────── Jargon File ────────────────────────────
  {
    sourceKey: "jargon-file",
    name: "Jargon File / The New Hacker's Dictionary",
    homepage: "http://www.catb.org/jargon/",
    licenseName: "OPL-1.0",
    attribution:
      "The Jargon File, Eric S. Raymond (ed.); Project Gutenberg edition (Public Domain in US).",
    terms: [
      {
        externalId: "grep",
        term: "grep",
        aliases: [],
        definition:
          "To rapidly scan a file or set of files looking for a particular string or pattern.",
        category: "cultural",
        metadata: { pronunciation: "grep", partOfSpeech: "vi.", etymology: "from qed/ed" },
      },
      {
        externalId: "phishing",
        term: "phishing",
        aliases: [],
        definition:
          "Cracker slang for attempting to obtain user passwords or credit card information by trickery.",
        category: "cultural",
        metadata: {},
      },
    ],
  },
];

export interface SeedResult {
  totalTerms: number;
  sourcesSeeded: string[];
}

export function seedTestCorpus(db: Database, opts: { staleSourceKey?: string } = {}): SeedResult {
  let totalTerms = 0;
  const sourcesSeeded: string[] = [];

  for (const src of SEED) {
    const ageHours =
      opts.staleSourceKey === src.sourceKey ? 24 * 60 : src.ageHours ?? 1;
    const refreshedAtMs = NOW - ageHours * 60 * 60 * 1000;
    const sourceId = upsertSource(db, {
      sourceKey: src.sourceKey,
      name: src.name,
      homepage: src.homepage,
      licenseName: src.licenseName,
      licenseUrl: null,
      attribution: src.attribution,
      lastRefreshedAt: new Date(refreshedAtMs).toISOString(),
      status: "ok",
    });
    sourcesSeeded.push(src.sourceKey);
    for (const t of src.terms) {
      upsertTerm(db, {
        sourceId,
        externalId: t.externalId,
        term: t.term,
        definition: t.definition,
        category: t.category,
        aliases: t.aliases,
        metadata: t.metadata ?? {},
      });
      totalTerms++;
    }
  }
  return { totalTerms, sourcesSeeded };
}

export function newSeededDb(opts: { staleSourceKey?: string } = {}): {
  db: Database;
  seed: SeedResult;
} {
  const db = new DatabaseConstructor(":memory:");
  applyMigrations(db);
  const seed = seedTestCorpus(db, opts);
  return { db, seed };
}
