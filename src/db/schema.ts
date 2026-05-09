// SQLite DDL for the glossary cache.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  source_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  homepage TEXT NOT NULL,
  license_name TEXT NOT NULL,
  license_url TEXT,
  attribution TEXT NOT NULL,
  last_refreshed_at TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  CHECK (status IN ('ok', 'stale', 'error', 'unknown'))
);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  category TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, external_id),
  CHECK (category IN (
    'cultural',
    'cti_actor',
    'cti_technique',
    'cti_software',
    'cti_tactic',
    'regulatory',
    'general'
  ))
);

CREATE INDEX IF NOT EXISTS idx_terms_term ON terms(term);

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source_alias_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_aliases_alias ON aliases(alias);

CREATE TABLE IF NOT EXISTS cross_refs (
  id INTEGER PRIMARY KEY,
  term_id_a INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  term_id_b INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  UNIQUE(term_id_a, term_id_b, kind),
  CHECK (kind IN ('alias_of', 'related', 'see_also'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS terms_fts USING fts5(
  term,
  definition,
  content='terms',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS terms_ai AFTER INSERT ON terms BEGIN
  INSERT INTO terms_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER IF NOT EXISTS terms_ad AFTER DELETE ON terms BEGIN
  INSERT INTO terms_fts(terms_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TRIGGER IF NOT EXISTS terms_au AFTER UPDATE ON terms BEGIN
  INSERT INTO terms_fts(terms_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
  INSERT INTO terms_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;
`;
