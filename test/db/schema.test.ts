import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../src/db/migrations.js";
import {
  getAliasesForTerm,
  getCrossRefs,
  getStaleSources,
  getTermByExternalId,
  getTermById,
  listSources,
  lookupExact,
  searchTerms,
  upsertSource,
  upsertTerm,
} from "../../src/db/queries.js";

describe("database schema and queries", () => {
  const openMemoryDb = () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    applyMigrations(db);
    return db;
  };

  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("creates all tables, indexes, and FTS triggers", () => {
    db = openMemoryDb();

    const objects = db
      .prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string; type: string }>;
    const names = objects.map((object) => object.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "_migrations",
        "sources",
        "terms",
        "aliases",
        "cross_refs",
        "terms_fts",
        "idx_terms_term",
        "idx_aliases_alias",
        "terms_ai",
        "terms_ad",
        "terms_au",
      ])
    );
  });

  it("can re-run migrations idempotently", () => {
    db = openMemoryDb();

    applyMigrations(db);

    const rows = db.prepare("SELECT version FROM _migrations").all();
    expect(rows).toEqual([{ version: 1 }]);
  });

  it("upserts sources and terms, replaces aliases, and searches with FTS ranking", () => {
    db = openMemoryDb();
    const sourceId = upsertSource(db, {
      sourceKey: "mitre-attack",
      name: "MITRE ATT&CK",
      homepage: "https://attack.mitre.org/",
      licenseName: "Apache-2.0",
      licenseUrl: "https://github.com/mitre/cti/blob/master/LICENSE.txt",
      attribution: "MITRE ATT&CK, Apache-2.0",
      lastRefreshedAt: "2026-05-01T00:00:00.000Z",
      status: "ok",
    });

    const firstId = upsertTerm(db, {
      sourceId,
      externalId: "T1566",
      term: "Phishing",
      definition: "Adversaries send phishing messages to gain access.",
      category: "cti_technique",
      aliases: ["Spearphishing"],
      metadata: { stixType: "attack-pattern" },
    });
    const secondId = upsertTerm(db, {
      sourceId,
      externalId: "T1589",
      term: "Gather Victim Identity Information",
      definition: "Adversaries gather email addresses before phishing.",
      category: "cti_technique",
      aliases: ["Email collection"],
      metadata: {},
    });

    expect(firstId).not.toBe(secondId);
    expect(searchTerms(db, "phishing", { limit: 2 }).map((row) => row.term)).toEqual([
      "Phishing",
      "Gather Victim Identity Information",
    ]);
    expect(lookupExact(db, "spearphishing")).toHaveLength(1);

    const updatedId = upsertTerm(db, {
      sourceId,
      externalId: "T1566",
      term: "Phishing",
      definition: "Adversaries use phishing for initial access.",
      category: "cti_technique",
      aliases: ["Phishing attack"],
      metadata: { updated: true },
    });

    expect(updatedId).toBe(firstId);
    expect(getAliasesForTerm(db, firstId)).toEqual(["Phishing attack"]);
    expect(getTermById(db, firstId)?.metadata).toEqual({ updated: true });
    expect(getTermByExternalId(db, "mitre-attack", "T1566")?.term).toBe("Phishing");
  });

  it("returns cross references with linked terms", () => {
    db = openMemoryDb();
    const sourceId = upsertSource(db, {
      sourceKey: "jargon-file",
      name: "The Jargon File",
      homepage: "http://catb.org/jargon/",
      licenseName: "OPL-1.0",
      attribution: "The Jargon File, OPL-1.0",
      lastRefreshedAt: "2026-05-01T00:00:00.000Z",
      status: "ok",
    });
    const fooId = upsertTerm(db, {
      sourceId,
      externalId: "foo",
      term: "Foo",
      definition: "A metasyntactic variable.",
      category: "cultural",
      aliases: [],
      metadata: {},
    });
    const barId = upsertTerm(db, {
      sourceId,
      externalId: "bar",
      term: "Bar",
      definition: "Another metasyntactic variable.",
      category: "cultural",
      aliases: [],
      metadata: {},
    });

    db.prepare(
      "INSERT INTO cross_refs (term_id_a, term_id_b, kind, confidence) VALUES (?, ?, ?, ?)"
    ).run(fooId, barId, "see_also", 0.75);

    expect(getCrossRefs(db, fooId)).toEqual([
      expect.objectContaining({
        termId: barId,
        term: "Bar",
        kind: "see_also",
        confidence: 0.75,
      }),
    ]);
  });

  it("lists stale sources with null or old refresh timestamps", () => {
    db = openMemoryDb();
    upsertSource(db, {
      sourceKey: "nist",
      name: "NIST Glossary",
      homepage: "https://csrc.nist.gov/glossary",
      licenseName: "Public Domain",
      attribution: "NIST Glossary, Public Domain",
      lastRefreshedAt: "2000-01-01T00:00:00.000Z",
      status: "stale",
    });
    upsertSource(db, {
      sourceKey: "enisa",
      name: "ENISA Glossary",
      homepage: "https://www.enisa.europa.eu/",
      licenseName: "CC-BY-4.0",
      attribution: "ENISA Glossary, CC-BY-4.0",
      lastRefreshedAt: null,
      status: "unknown",
    });
    upsertSource(db, {
      sourceKey: "ofac-sdn",
      name: "OFAC SDN",
      homepage: "https://ofac.treasury.gov/",
      licenseName: "Public Domain",
      attribution: "OFAC SDN List, Public Domain",
      lastRefreshedAt: new Date().toISOString(),
      status: "ok",
    });

    expect(getStaleSources(db, 30).map((source) => source.sourceKey).sort()).toEqual([
      "enisa",
      "nist",
    ]);
    expect(listSources(db)).toHaveLength(3);
  });
});
