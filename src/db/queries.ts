// Typed query helpers for glossary storage.
import type { Database } from "better-sqlite3";
import type { TermCategory } from "../sources/_adapter.js";
import type {
  CrossRefKind,
  CrossRefRecord,
  SourceRecord,
  SourceStatus,
  TermFull,
  TermInput,
  TermSearchResult,
} from "./types.js";

export type {
  CrossRefKind,
  CrossRefRecord,
  SourceRecord,
  SourceStatus,
  TermFull,
  TermInput,
  TermSearchResult,
};

interface SourceRow {
  id: number;
  source_key: string;
  name: string;
  homepage: string;
  license_name: string;
  license_url: string | null;
  attribution: string;
  last_refreshed_at: string | null;
  status: SourceStatus;
}

interface TermRow {
  id: number;
  source_id: number;
  source_key: string;
  source_name: string;
  external_id: string;
  term: string;
  definition: string;
  category: TermCategory;
  metadata_json: string;
  attribution: string;
  created_at?: string;
  updated_at?: string;
  rank?: number | null;
}

interface CrossRefRow {
  id: number;
  term_id: number;
  source_id: number;
  source_key: string;
  source_name: string;
  external_id: string;
  term: string;
  definition: string;
  category: TermCategory;
  kind: CrossRefKind;
  confidence: number;
  attribution: string;
}

function sourceFromRow(row: SourceRow): SourceRecord {
  return {
    id: row.id,
    sourceKey: row.source_key,
    name: row.name,
    homepage: row.homepage,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    attribution: row.attribution,
    lastRefreshedAt: row.last_refreshed_at,
    status: row.status,
  };
}

function parseMetadata(json: string): Record<string, unknown> {
  const parsed = JSON.parse(json) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function getAliases(db: Database, termId: number): string[] {
  return (
    db
      .prepare("SELECT alias FROM aliases WHERE term_id = ? ORDER BY id")
      .all(termId) as Array<{ alias: string }>
  ).map((row) => row.alias);
}

function termSearchResultFromRow(db: Database, row: TermRow): TermSearchResult {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    sourceName: row.source_name,
    externalId: row.external_id,
    term: row.term,
    definition: row.definition,
    category: row.category,
    aliases: getAliases(db, row.id),
    metadata: parseMetadata(row.metadata_json),
    rank: row.rank ?? null,
    attribution: row.attribution,
  };
}

function termFullFromRow(db: Database, row: TermRow): TermFull {
  return {
    ...termSearchResultFromRow(db, row),
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function makeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" ");
}

export function upsertSource(db: Database, source: SourceRecord): number {
  const result = db
    .prepare(
      `
      INSERT INTO sources (
        source_key,
        name,
        homepage,
        license_name,
        license_url,
        attribution,
        last_refreshed_at,
        status
      )
      VALUES (@sourceKey, @name, @homepage, @licenseName, @licenseUrl, @attribution, @lastRefreshedAt, @status)
      ON CONFLICT(source_key) DO UPDATE SET
        name = excluded.name,
        homepage = excluded.homepage,
        license_name = excluded.license_name,
        license_url = excluded.license_url,
        attribution = excluded.attribution,
        last_refreshed_at = excluded.last_refreshed_at,
        status = excluded.status
      RETURNING id
      `
    )
    .get({
      ...source,
      licenseUrl: source.licenseUrl ?? null,
      lastRefreshedAt: source.lastRefreshedAt ?? null,
    }) as { id: number };

  return result.id;
}

export function upsertTerm(db: Database, input: TermInput): number {
  const write = db.transaction((term: TermInput) => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `
        INSERT INTO terms (
          source_id,
          external_id,
          term,
          definition,
          category,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES (@sourceId, @externalId, @term, @definition, @category, @metadataJson, @now, @now)
        ON CONFLICT(source_id, external_id) DO UPDATE SET
          term = excluded.term,
          definition = excluded.definition,
          category = excluded.category,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
        RETURNING id
        `
      )
      .get({
        ...term,
        metadataJson: JSON.stringify(term.metadata),
        now,
      }) as { id: number };

    db.prepare("DELETE FROM aliases WHERE term_id = ?").run(result.id);
    const insertAlias = db.prepare(
      "INSERT INTO aliases (term_id, alias, source_alias_id) VALUES (?, ?, ?)"
    );
    for (const alias of term.aliases) {
      insertAlias.run(result.id, alias, null);
    }

    return result.id;
  });

  return write(input);
}

export function searchTerms(
  db: Database,
  query: string,
  opts: { source?: string; category?: TermCategory; limit?: number } = {}
): TermSearchResult[] {
  const limit = opts.limit ?? 20;
  const matchQuery = makeFtsQuery(query);
  if (matchQuery.length === 0) {
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.source_id,
        s.source_key,
        s.name AS source_name,
        t.external_id,
        t.term,
        t.definition,
        t.category,
        t.metadata_json,
        s.attribution,
        bm25(terms_fts) AS rank
      FROM terms_fts
      JOIN terms t ON t.id = terms_fts.rowid
      JOIN sources s ON s.id = t.source_id
      WHERE terms_fts MATCH @query
        AND (@source IS NULL OR s.source_key = @source)
        AND (@category IS NULL OR t.category = @category)
      ORDER BY rank, lower(t.term)
      LIMIT @limit
      `
    )
    .all({
      query: matchQuery,
      source: opts.source ?? null,
      category: opts.category ?? null,
      limit,
    }) as TermRow[];

  return rows.map((row) => termSearchResultFromRow(db, row));
}

export function lookupExact(
  db: Database,
  term: string,
  opts: { source?: string } = {}
): TermSearchResult[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT
        t.id,
        t.source_id,
        s.source_key,
        s.name AS source_name,
        t.external_id,
        t.term,
        t.definition,
        t.category,
        t.metadata_json,
        s.attribution,
        NULL AS rank
      FROM terms t
      JOIN sources s ON s.id = t.source_id
      LEFT JOIN aliases a ON a.term_id = t.id
      WHERE (lower(t.term) = lower(@term) OR lower(a.alias) = lower(@term))
        AND (@source IS NULL OR s.source_key = @source)
      ORDER BY lower(t.term)
      `
    )
    .all({ term, source: opts.source ?? null }) as TermRow[];

  return rows.map((row) => termSearchResultFromRow(db, row));
}

export function getTermById(db: Database, id: number): TermFull | null {
  const row = db
    .prepare(
      `
      SELECT
        t.id,
        t.source_id,
        s.source_key,
        s.name AS source_name,
        t.external_id,
        t.term,
        t.definition,
        t.category,
        t.metadata_json,
        t.created_at,
        t.updated_at,
        s.attribution
      FROM terms t
      JOIN sources s ON s.id = t.source_id
      WHERE t.id = ?
      `
    )
    .get(id) as TermRow | undefined;

  return row ? termFullFromRow(db, row) : null;
}

export function getTermByExternalId(
  db: Database,
  sourceKey: string,
  externalId: string
): TermFull | null {
  const row = db
    .prepare(
      `
      SELECT
        t.id,
        t.source_id,
        s.source_key,
        s.name AS source_name,
        t.external_id,
        t.term,
        t.definition,
        t.category,
        t.metadata_json,
        t.created_at,
        t.updated_at,
        s.attribution
      FROM terms t
      JOIN sources s ON s.id = t.source_id
      WHERE s.source_key = ? AND t.external_id = ?
      `
    )
    .get(sourceKey, externalId) as TermRow | undefined;

  return row ? termFullFromRow(db, row) : null;
}

export function getAliasesForTerm(db: Database, termId: number): string[] {
  return getAliases(db, termId);
}

export function getCrossRefs(db: Database, termId: number): CrossRefRecord[] {
  const rows = db
    .prepare(
      `
      SELECT
        cr.id,
        linked.id AS term_id,
        linked.source_id,
        s.source_key,
        s.name AS source_name,
        linked.external_id,
        linked.term,
        linked.definition,
        linked.category,
        cr.kind,
        cr.confidence,
        s.attribution
      FROM cross_refs cr
      JOIN terms linked ON linked.id = CASE
        WHEN cr.term_id_a = @termId THEN cr.term_id_b
        ELSE cr.term_id_a
      END
      JOIN sources s ON s.id = linked.source_id
      WHERE cr.term_id_a = @termId OR cr.term_id_b = @termId
      ORDER BY cr.kind, lower(linked.term)
      `
    )
    .all({ termId }) as CrossRefRow[];

  return rows.map((row) => ({
    id: row.id,
    termId: row.term_id,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    sourceName: row.source_name,
    externalId: row.external_id,
    term: row.term,
    definition: row.definition,
    category: row.category,
    kind: row.kind,
    confidence: row.confidence,
    attribution: row.attribution,
  }));
}

export function listSources(db: Database): SourceRecord[] {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        source_key,
        name,
        homepage,
        license_name,
        license_url,
        attribution,
        last_refreshed_at,
        status
      FROM sources
      ORDER BY source_key
      `
    )
    .all() as SourceRow[];

  return rows.map(sourceFromRow);
}

export function getStaleSources(
  db: Database,
  thresholdDays: number
): SourceRecord[] {
  const threshold = new Date(
    Date.now() - thresholdDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const rows = db
    .prepare(
      `
      SELECT
        id,
        source_key,
        name,
        homepage,
        license_name,
        license_url,
        attribution,
        last_refreshed_at,
        status
      FROM sources
      WHERE last_refreshed_at IS NULL OR last_refreshed_at < ?
      ORDER BY source_key
      `
    )
    .all(threshold) as SourceRow[];

  return rows.map(sourceFromRow);
}
