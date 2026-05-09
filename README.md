# mcp-cti-glossary

> Real-time CTI and cyber jargon disambiguation for Claude (and any MCP-aware client).

[![CI](https://github.com/aplaceforallmystuff/mcp-cti-glossary/actions/workflows/ci.yml/badge.svg)](https://github.com/aplaceforallmystuff/mcp-cti-glossary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](#requirements)

An MCP server that aggregates eight authoritative cyber threat intelligence and security glossaries into a single FTS5-indexed SQLite store, exposed through 7 tools. Use it to disambiguate overloaded terms (NICKEL, CHROMIUM), resolve cross-vendor threat-actor naming (Salt Typhoon ↔ GhostEmperor ↔ FamousSparrow), look up ATT&CK techniques by ID, or scan ~34k terms with full-text search.

**v0.1.0 corpus: ~34,000 terms across 8 sources** — MITRE ATT&CK, NIST CSRC Glossary, ENISA Glossary, ENISA Threat Taxonomy, MISP Galaxy (threat-actor + Microsoft activity groups), OFAC SDN, the Jargon File / New Hacker's Dictionary, and a hand-curated cross-vendor alias YAML.

## Why this exists

Operational CTI work is dense with overlapping vocabularies — Salt Typhoon, GhostEmperor, FamousSparrow, and UNC2286 are the same threat cluster named by four different vendors. NICKEL is a Microsoft codename, an OFAC entity, a chemical element, and a Mandiant tracker. Each new term costs context and reading time. This server collapses that cost into one tool call, with attribution metadata so the answer is auditable.

## Usage

Once the server is wired into Claude Code (see [Configure Claude Code](#configure-claude-code) below), you don't call the tools by name — you just talk to Claude and it picks the right one. Realistic prompts paired with the tool each one triggers:

### Disambiguating an overloaded term

> *"In the Salt Typhoon write-up I'm reading, NICKEL keeps coming up. Which NICKEL is this?"*

Triggers `glossary_disambiguate`. Returns ranked candidates — the vendor-aliases NICKEL disambiguation entry first (which explains the Ke3chang/APT15 sense plus the NICKEL ACADEMY and NICKEL GLADSTONE Microsoft trackers), then any OFAC SDN entries with NICKEL in the name as fuzzy matches. You pick the right sense based on the article context.

### Cross-vendor actor resolution

> *"I'm looking at a Mandiant report that mentions GhostEmperor. Is that a known cluster?"*

Triggers `glossary_lookup`. Returns the **Salt Typhoon** entry from both `vendor-aliases` and `misp-galaxy` (whose Microsoft codename also points to it) with the full alias list — GhostEmperor, FamousSparrow, UNC2286, Earth Estries, RedMike. Confirms it's the same actor under different vendor names.

### APT lookup with full alias map

> *"Pull up everything on APT28 — I need the full vendor naming spread."*

Triggers `glossary_actor`. Returns the MITRE ATT&CK G0007 entry (Fancy Bear, Sofacy, Sednit, STRONTIUM…) alongside the MISP Galaxy Microsoft-codename entry (Strontium with Forest Blizzard / APT28 synonyms) — full cross-vendor coverage in one response.

### ATT&CK technique by ID

> *"What's T1566.001?"*

Triggers `glossary_technique`. Returns Spearphishing Attachment with kill-chain phases, platforms, and the ATT&CK URL. Faster than alt-tabbing to attack.mitre.org.

### Fuzzy search across the corpus

> *"Search the glossary for anything related to telecom pre-positioning."*

Triggers `glossary_search`. FTS5 BM25 ranking — first hits will be Salt Typhoon, Volt Typhoon, and ATT&CK techniques (T1190, T1078) involving telecom infrastructure.

### OFAC sanctions check

> *"Is Huione Group on the OFAC SDN list?"*

Triggers `glossary_lookup`. Returns the vendor-aliases entry plus any matching SDN entries with their program codes (CYBER2, NARCO, etc.).

### Multi-actor audit

> *"I'm referencing several threat clusters in this report. For each name in this list, pull the canonical entry and aliases so I can spot-check sourcing."*

Claude makes sequential `glossary_actor` and `glossary_lookup` calls. Returns a quick audit table — useful before sending a threat report or quoting a cluster name in any deliverable.

### Refresh after upstream update

> *"OFAC updated the SDN list this morning. Refresh the glossary."*

Triggers `glossary_refresh({ source: "ofac-sdn" })`. ~25 seconds. No rebuild or server restart needed.

### Health check

> *"How fresh is my glossary corpus?"*

Triggers `glossary_stats`. Returns total term count, per-source counts and last-refresh timestamps, plus a stale-source flag for anything older than 30 days.

The compounding value: each time you encounter a new term in CTI material, you ask Claude inline. The structured response carries source attribution — when you quote it in a report, briefing, or any deliverable, the citation chain stays intact.

## Tools

All 7 tools return structured JSON with source attribution. The reference below is for direct tool invocation; for natural-language usage see [Usage](#usage) above.

### `glossary_disambiguate(term, context?)`

Headline tool. Returns ranked candidates (exact matches first, then FTS5 fuzzy) for an ambiguous term.

```jsonc
// Call: glossary_disambiguate({ term: "NICKEL" })
{
  "term": "NICKEL",
  "exactMatchCount": 1,
  "totalCandidateCount": 4,
  "candidates": [
    {
      "rank": 1,
      "term": "NICKEL",
      "source": "vendor-aliases",
      "category": "general",
      "externalId": "nickel-disambiguation",
      "aliases": ["NICKEL ACADEMY", "NICKEL GLADSTONE"],
      "matchKind": "exact",
      "definition": "NICKEL is overloaded across security vocabularies...",
      "attribution": "Hand-curated cross-vendor naming, mcp-cti-glossary (MIT)."
    },
    // ... OFAC and other fuzzy matches follow
  ]
}
```

### `glossary_lookup(term, source?)`

Exact match by term or alias (case-insensitive), across all sources or scoped to one. An alias hit returns the canonical entry from every source that knows it — so `glossary_lookup({ term: "GhostEmperor" })` returns Salt Typhoon from both `vendor-aliases` and `misp-galaxy`.

### `glossary_search(query, source?, category?, limit?)`

FTS5 fuzzy search across term names and definitions, BM25-ranked. Filter by source key (`mitre-attack`, `nist`, `enisa-glossary`, …) or category (`cti_actor`, `cti_technique`, `cultural`, `regulatory`, `general`, …).

### `glossary_actor(name_or_alias)`

Threat-actor specific. Resolves any alias to the canonical entry across every source that tracks it. Useful for cross-vendor reconciliation: ask for `APT28` and you get MITRE's intrusion-set entry plus MISP Galaxy's Microsoft `Strontium` codename in one response.

### `glossary_technique(technique_id)`

ATT&CK technique by canonical ID — supports both top-level (`T1566`) and sub-techniques (`T1566.001`). Schema-validated, so malformed IDs are rejected before the DB query.

### `glossary_refresh(source?)`

Manually re-ingest one source or all. Useful when OFAC publishes a new SDN list, MITRE releases a new ATT&CK version, or NIST updates the daily glossary export. Source keys: `mitre-attack`, `ofac-sdn`, `vendor-aliases`, `nist`, `misp-galaxy`, `enisa-glossary`, `enisa-taxonomy`, `jargon-file`.

### `glossary_stats(staleThresholdDays?)`

Corpus health: per-source counts, last-refresh timestamps, stale-source flag.

## Sources

| Source | License | Type | Approx. terms | Refresh |
|---|---|---|---|---|
| [MITRE ATT&CK Enterprise](https://attack.mitre.org/) | Apache-2.0 | Static STIX 2.1 bundle | ~1,700 | On-demand via `glossary_refresh` |
| [NIST CSRC Glossary](https://csrc.nist.gov/glossary) | Public Domain (US) | Daily JSON export (zip) | ~9,800 | Daily upstream; on-demand here |
| [OFAC SDN List](https://ofac.treasury.gov/) | Public Domain (US) | XML feed | ~19,000 | Treasury updates ~weekly |
| [Jargon File](http://www.catb.org/jargon/) | OPL-1.0 / Public Domain (PG ed.) | Project Gutenberg plain text | ~2,300 | On-demand |
| [MISP Galaxy](https://github.com/MISP/misp-galaxy) | CC0-1.0 / BSD-2-Clause | threat-actor + microsoft-activity-group JSON | ~1,150 | On-demand |
| [ENISA Glossary](https://www.enisa.europa.eu/media/media-press-kits/enisa-glossary) | CC-BY-4.0 | HTML scrape (snapshot-tested) | ~120 | On-demand |
| [ENISA Threat Taxonomy](https://github.com/MISP/misp-taxonomies/tree/main/enisa) | CC0-1.0 / BSD-2-Clause | MISP machinetag JSON | ~170 | On-demand |
| Vendor aliases (cross-walk) | MIT (this repo) | Hand-curated YAML | ~10 | Edit `data/vendor_aliases.yaml` and refresh |

Every tool response carries license attribution metadata. See [LICENSES.md](./LICENSES.md) for full per-source attribution requirements.

## Requirements

- Node ≥ 18
- macOS, Linux, or Windows (cache path resolves correctly via `env-paths`)
- ~30 MB disk for the populated SQLite cache (after VACUUM)

## Install

This package is not yet on npm. Install from GitHub:

```bash
git clone https://github.com/aplaceforallmystuff/mcp-cti-glossary.git
cd mcp-cti-glossary
npm install
npm run build
```

On first launch the server downloads a prebuilt ~8 MB gzipped database from the latest GitHub Release (decompresses to ~28 MB on disk). If that artifact is unreachable for any reason, the server falls back to running every adapter live (~30s). You can also pre-populate manually:

```bash
npm run ingest    # ~30s — populates ~/Library/Application Support/mcp-cti-glossary/glossary.db on macOS
```

(npm publish is planned for v0.1.0; until then, install via clone.)

## Configure Claude Code

Add to your `~/.claude.json` (or wherever your Claude Code MCP config lives):

```json
{
  "mcpServers": {
    "cti-glossary": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-cti-glossary/dist/index.js"]
    }
  }
}
```

Restart Claude Code. The seven `glossary_*` tools will be available in any session.

## Configure Claude Desktop

Same shape, in `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "cti-glossary": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-cti-glossary/dist/index.js"]
    }
  }
}
```

## Architecture

- TypeScript ES modules, `@modelcontextprotocol/sdk` v1.26+
- SQLite via `better-sqlite3` with FTS5 virtual tables (BM25 ranking, `unicode61 remove_diacritics 2` tokenizer)
- `zod` + `zod-to-json-schema` for tool input validation
- Cache path via `env-paths` (`~/Library/Application Support/mcp-cti-glossary/glossary.db` on macOS)
- One file per tool in `src/tools/`, one per source adapter in `src/sources/`
- `src/ingest/` holds the shared orchestrator, the prebuilt-DB fetcher, and the first-run resolver (cache → release artifact → live ingest)

The `SourceAdapter` interface in `src/sources/_adapter.ts` is the contract for adding new sources. Each adapter implements `fetch(): Promise<RawDoc[]>` and `normalize(doc: RawDoc): Term[]`. Adding a new source is roughly: write the adapter, add a YAML/JSON fixture, write a normalize-only test, register in `src/ingest/orchestrator.ts` and `src/tools/refresh.ts`. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Development

```bash
npm install
npm run build       # tsc → dist/
npm run watch       # tsc --watch
npm test            # vitest run (120 tests across 21 files)
npm run typecheck   # tsc --noEmit
npm run ingest      # populate local SQLite cache (live ingest, ~30s)
npm run build:db    # CI artifact builder — produces build/glossary.db.gz + sha256
```

Smoke-test the tool layer end-to-end against the populated DB:

```bash
npx tsx scripts/smoke-tools.ts
```

## Releases

Tagging `v*.*.*` on `main` triggers `.github/workflows/release-db.yml`, which:

1. Runs typecheck + the full test suite.
2. Executes every adapter against live upstream sources.
3. VACUUMs the resulting database, gzips it, computes `sha256`.
4. Uploads `glossary.db.gz` + `glossary.db.gz.sha256` to the matching GitHub Release.

The MCP server's first-run resolver downloads from `releases/latest/download/glossary.db.gz`, so consumers never wait on a live ingest unless GitHub itself is unreachable.

## Troubleshooting

**Server boots but Claude Code reports "no tools available."**

1. Confirm the path in your MCP config is absolute and points to `dist/index.js`, not `src/`.
2. Run `node /absolute/path/to/dist/index.js < /dev/null` from a terminal — within a second or two you should see `mcp-cti-glossary v0.1.0 running on stdio (db: cache|prebuilt|live-ingest)` on stderr. If not, the build is stale: `npm run build`.
3. Check Claude Code's MCP logs for handshake errors.

**Tools return "no results" for terms you know exist.**

The DB may be empty if the prebuilt fetch failed and live ingest was skipped. Check `glossary_stats({})` for the source counts. If they're all zero, run `npm run ingest` once or call `glossary_refresh({})` from any session.

**`npm run ingest` fails with "Failed to fetch MITRE ATT&CK bundle".**

The static STIX bundle on `github.com/mitre/cti` is a ~50 MB download. Check your network and try again.

**OFAC SDN ingest hangs.**

The Treasury XML feed is ~27 MB and parses to ~19K records. Expect 20–30 seconds. If it stalls beyond a minute, the feed endpoint may be down — try `curl -I https://www.treasury.gov/ofac/downloads/sdn.xml` to verify reachability.

**FTS5 search returns no results for partial terms.**

The FTS5 query is built by quoting each whitespace-separated token. Single-character tokens won't match. Try at least three characters per token, or use `glossary_lookup` for exact matches by alias.

## Roadmap

### v1.1+

- **Public npm publish** as `mcp-cti-glossary-server`
- **SANS / HackTheBox / Spyscape glossaries**
- **Microsoft Threat Actor Naming taxonomy scraper** (with snapshot tests for DOM churn)
- **Mandiant + CrowdStrike vendor-naming scrapers**
- **Live TAXII polling** instead of static STIX bundle for ATT&CK
- **Auto-refresh cron** (until then, users call `glossary_refresh` manually)
- **Optional web-search fallback** for unknown terms (env-var opt-in)

### Out of scope (locked)

- Embedded vector search — exact-match FTS5 covers the operational need
- Multi-language glossaries — English-only
- Vault writeback — pure MCP server, no side effects on the user's filesystem beyond the cache DB
- Live scraping of vendor pages — legal posture is murky; we use only public alias mappings already in MITRE plus the redistributable MISP Galaxy data

## License

MIT — see [LICENSE](./LICENSE).

Source data is aggregated under the licenses listed in [LICENSES.md](./LICENSES.md). Every tool response carries attribution metadata so downstream usage stays clean (e.g. when quoting results in threat reports or briefings).

## Contributing

Bugs, PRs, and new source adapters welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). The `SourceAdapter` interface in `src/sources/_adapter.ts` documents the contract; the eight existing adapters are reference implementations of every common shape (STIX JSON, XML feed, gzipped JSON dump, HTML scrape, MISP machinetag JSON, plain-text Project Gutenberg edition, and hand-curated YAML).

## Acknowledgements

- **MITRE Corporation** — for ATT&CK, the canonical operational CTI taxonomy
- **NIST CSRC** — for the daily-updated public-domain glossary export
- **ENISA (European Union Agency for Cybersecurity)** — for the open glossary and threat taxonomy
- **MISP Project / CIRCL** — for the redistributable galaxy + taxonomy ecosystem that makes cross-vendor naming tractable
- **US Department of the Treasury / OFAC** — for the SDN list as a public-domain feed
- **Eric S. Raymond** and the broader Jargon File contributor lineage — for the cultural slang corpus
- The cross-vendor naming community (Microsoft Threat Intelligence, Mandiant, CrowdStrike, Recorded Future, ESET, Kaspersky, SentinelOne et al.) for the cluster aliases that make threat-actor disambiguation possible
