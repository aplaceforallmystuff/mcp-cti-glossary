# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Breaking:** dropped Node 18 support. Minimum runtime is now Node 20. Node 18
  reached end-of-life in April 2025, and `undici` v6+ (a transitive test-time
  dependency) requires the global `File` constructor, which is only available
  on Node ≥ 20. CI matrix narrowed to 20.x and 22.x.

## [0.1.0] - 2026-05-09

First public release. Aggregates eight authoritative CTI / cyber glossaries
into a single FTS5-indexed SQLite store and exposes them through 7 MCP tools.

### Added

#### Source adapters (8)
- **MITRE ATT&CK Enterprise** — STIX 2.1 bundle, intrusion-sets / malware /
  tools / techniques / tactics. Apache-2.0.
- **OFAC SDN List** — Treasury XML feed parsed via `fast-xml-parser`. Public Domain.
- **NIST CSRC Glossary** — daily zip / JSON export from `csrc.nist.gov`,
  ~9,800 terms with abbreviation-redirect handling. Public Domain.
- **MISP Galaxy** — `threat-actor.json` + `microsoft-activity-group.json`
  pulled from raw GitHub. Closes the v1.1-deferred Microsoft / Mandiant /
  CrowdStrike vendor-naming gap without scraping vendor pages. CC0-1.0 / BSD-2-Clause.
- **ENISA Glossary** — HTML scrape of the media-press-kits glossary page,
  snapshot-tested via `cheerio` so layout drift fails CI. CC-BY-4.0.
- **ENISA Threat Taxonomy** — MISP machinetag JSON from `MISP/misp-taxonomies`,
  complementing the ENISA HTML glossary. CC0-1.0 / BSD-2-Clause.
- **Jargon File / The New Hacker's Dictionary** — Project Gutenberg eBook #3008
  parsed via `Node:` markers. ~2,300 cultural-slang terms with pronunciation,
  part-of-speech, and bracketed etymology metadata. OPL-1.0 / Public Domain (PG ed.).
- **Vendor aliases** — hand-curated YAML for cross-vendor cluster naming
  (Salt Typhoon ↔ GhostEmperor ↔ FamousSparrow ↔ UNC2286 etc.). MIT.

#### MCP tools (7)
- `glossary_disambiguate` — multi-source ranked candidates for ambiguous terms
- `glossary_lookup` — exact term-or-alias match across sources
- `glossary_search` — FTS5 BM25 fuzzy search
- `glossary_actor` — APT-specific lookup with cross-vendor alias resolution
- `glossary_technique` — ATT&CK technique by canonical ID (T1234[.001])
- `glossary_refresh` — manual re-ingest of one source or all
- `glossary_stats` — corpus health + per-source freshness flags

#### Infrastructure
- SQLite via `better-sqlite3` with FTS5 virtual tables (BM25 ranking,
  `unicode61 remove_diacritics 2` tokenizer)
- Versioned migrations (`src/db/migrations.ts`)
- Cache path resolution via `env-paths`
- Shared ingest orchestrator (`src/ingest/orchestrator.ts`) used by local ingest,
  CI build, and lazy startup paths
- First-run resolver (`src/ingest/ensure-db.ts`): cache → prebuilt artifact
  → live ingest fallback chain, no-throw on any failure
- Prebuilt-DB fetcher (`src/ingest/fetch-prebuilt.ts`) — streams gzipped
  artifact from GitHub Releases, decompresses to cache, optional sha256 verify
- CI artifact builder (`scripts/build-db.ts`) — produces compact VACUUMed
  `glossary.db`, gzipped to ~8 MB, with sha256 checksum
- `.github/workflows/release-db.yml` — on tag `v*`, builds + uploads
  `glossary.db.gz` and `glossary.db.gz.sha256` to the matching GitHub Release
- `.github/workflows/ci.yml` — typecheck, test, build matrix on Node 18 / 20 / 22

#### Tests
- 120 vitest cases across 21 test files
- Per-adapter normalize-only tests against synthetic fixtures
- Orchestrator tests with stub adapters (in-memory SQLite)
- Prebuilt-DB fetcher tests against a local HTTP server (happy path + 404 +
  checksum mismatch)
- Per-tool tests (disambiguate, lookup, search, actor, technique, stats, refresh)
- End-to-end verification scenarios (NICKEL multi-candidate, Salt Typhoon
  alias resolution, APT28 cross-vendor coverage, T1566 + sub-technique,
  "phishing" FTS5 ranking, glossary_stats freshness flagging)

### Corpus

Live build: ~34,000 terms across 8 sources, compact DB ~28 MB,
gzipped artifact ~8 MB.
