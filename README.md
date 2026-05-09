# mcp-cti-glossary

> Real-time CTI and cyber jargon disambiguation for Claude (and any MCP-aware client).

[![CI](https://github.com/aplaceforallmystuff/mcp-cti-glossary/actions/workflows/ci.yml/badge.svg)](https://github.com/aplaceforallmystuff/mcp-cti-glossary/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](#requirements)

An MCP server that aggregates authoritative cyber threat intelligence and security glossaries into a single FTS5-indexed SQLite store, exposed through 7 tools. Use it to disambiguate overloaded terms (NICKEL, CHROMIUM), resolve cross-vendor threat-actor naming (Salt Typhoon ↔ GhostEmperor ↔ FamousSparrow), look up ATT&CK techniques by ID, or scan ~20K terms with full-text search.

**v1 corpus: 20,664 terms** across MITRE ATT&CK (1,707), OFAC SDN List (18,947), and a hand-curated cross-vendor alias YAML (10).

## Why this exists

Operational CTI work is dense with overlapping vocabularies — Salt Typhoon, GhostEmperor, FamousSparrow, and UNC2286 are the same threat cluster named by four different vendors. NICKEL is a Microsoft codename, an OFAC entity, a chemical element, and a Mandiant tracker. Each new term costs context and reading time. This server collapses that cost into one tool call, with attribution metadata so the answer is auditable.

## Usage

Once the server is wired into Claude Code (see [Configure Claude Code](#configure-claude-code) below), you don't call the tools by name — you just talk to Claude and it picks the right one. Below are realistic prompts paired with the tool each one triggers.

### Disambiguating an overloaded term

> *"In the Salt Typhoon write-up I'm reading, NICKEL keeps coming up. Which NICKEL is this?"*

Triggers `glossary_disambiguate`. Returns ranked candidates — top hit is **Ke3chang** (which has NICKEL as a Microsoft codename alias), with **APT38** (NICKEL GLADSTONE) and **Lazarus Group** (NICKEL ACADEMY) as alternates. The vendor-aliases entry explains the disambiguation pattern. You pick the right sense based on the article context.

### Cross-vendor actor resolution

> *"I'm looking at a Mandiant report that mentions GhostEmperor. Is that a known cluster?"*

Triggers `glossary_lookup`. Returns the **Salt Typhoon** entry with all five aliases (GhostEmperor, FamousSparrow, UNC2286, Earth Estries, RedMike) — confirms it's the same actor under different vendor names.

### APT lookup with full alias map

> *"Pull up everything on APT28 — I need the full vendor naming spread."*

Triggers `glossary_actor`. Returns canonical name + 15 aliases (Fancy Bear, STRONTIUM, Forest Blizzard, Sednit, Sofacy, Pawn Storm, GruesomeLarch, etc.) plus the ATT&CK G0007 description.

### ATT&CK technique by ID

> *"What's T1566.001?"*

Triggers `glossary_technique`. Returns Spearphishing Attachment with kill-chain phases, platforms, and ATT&CK URL. Faster than alt-tabbing to attack.mitre.org.

### Fuzzy search across the corpus

> *"Search the glossary for anything related to telecom pre-positioning."*

Triggers `glossary_search`. FTS5 BM25 ranking — first hits will be Salt Typhoon, Volt Typhoon, and ATT&CK techniques (T1190, T1078) involving telecom infrastructure.

### OFAC sanctions check

> *"Is Huione Group on the OFAC SDN list?"*

Triggers `glossary_lookup`. Returns vendor-aliases entry plus any matching SDN entries with their program codes (CYBER2, NARCO, etc.).

### Multi-actor audit

> *"I'm referencing several threat clusters in this report. For each name in this list, pull the canonical entry and aliases so I can spot-check sourcing."*

Claude makes sequential `glossary_actor` and `glossary_lookup` calls. Returns a quick audit table — useful before sending a threat report or quoting a cluster name in any deliverable.

### Refresh after upstream update

> *"OFAC updated the SDN list this morning. Refresh the glossary."*

Triggers `glossary_refresh({ source: "ofac-sdn" })`. ~25 seconds. No need to rebuild or restart the server.

### Health check

> *"How fresh is my glossary corpus?"*

Triggers `glossary_stats`. Returns total term count, per-source counts and last-refresh timestamps, plus a stale-source flag for anything older than 30 days.

The compounding value: each time you encounter a new term in CTI material, you ask Claude inline. The structured response carries source attribution — so when you quote it in a report, briefing, or any deliverable, the citation chain stays intact.

## Tools

All 7 tools return structured JSON with source attribution. The reference below is for direct tool invocation; for natural-language usage see [Usage](#usage) above.

### `glossary_disambiguate(term, context?)`

Headline tool. Returns ranked candidates (exact matches first, then FTS5 fuzzy) for an ambiguous term.

```jsonc
// Call: glossary_disambiguate({ term: "NICKEL" })
{
  "term": "NICKEL",
  "exactMatchCount": 2,
  "totalCandidateCount": 5,
  "candidates": [
    {
      "rank": 1,
      "term": "Ke3chang",
      "source": "mitre-attack",
      "category": "cti_actor",
      "externalId": "G0004",
      "aliases": ["APT15", "NICKEL", "Nylon Typhoon", ...],
      "matchKind": "exact",
      ...
    },
    ...
  ]
}
```

### `glossary_lookup(term, source?)`

Exact match by term or alias (case-insensitive), across all sources or scoped to one.

```jsonc
// Call: glossary_lookup({ term: "Salt Typhoon" })
// Returns ATT&CK G1045 entry + the vendor-aliases entry with extra cross-vendor names.
```

### `glossary_search(query, source?, category?, limit?)`

FTS5 fuzzy search across term names and definitions, BM25-ranked.

```jsonc
// Call: glossary_search({ query: "phishing kit", limit: 5 })
```

### `glossary_actor(name_or_alias)`

Threat-actor specific. Resolves any alias to the canonical entry with full alias list.

```jsonc
// Call: glossary_actor({ name_or_alias: "Fancy Bear" })
// Returns APT28 (G0007) with 15 aliases (STRONTIUM, Forest Blizzard, Pawn Storm, ...)
```

### `glossary_technique(technique_id)`

ATT&CK technique by canonical ID — supports both top-level (`T1566`) and sub-techniques (`T1566.001`).

```jsonc
// Call: glossary_technique({ technique_id: "T1566" })
// Returns Phishing technique with kill-chain phases, platforms, ATT&CK URL.
```

### `glossary_refresh(source?)`

Manually re-ingest one source or all. Useful when OFAC publishes a new SDN list or MITRE releases a new ATT&CK version.

```jsonc
// Call: glossary_refresh({ source: "ofac-sdn" })
// Or: glossary_refresh({})  // refresh all sources
```

### `glossary_stats(staleThresholdDays?)`

Corpus health: per-source counts, last-refresh timestamps, stale-source flag.

```jsonc
// Call: glossary_stats({})
// Returns: { totalTerms: 20664, sourceCount: 3, staleCount: 0, sources: [...] }
```

## Sources

| Source | License | Type | Size | Refresh |
|---|---|---|---|---|
| [MITRE ATT&CK Enterprise](https://attack.mitre.org/) | Apache-2.0 | Static STIX 2.1 bundle | 1,707 terms | On-demand via `glossary_refresh` |
| [OFAC SDN List](https://ofac.treasury.gov/) | Public Domain (US) | XML feed | 18,947 entries | On-demand; Treasury updates roughly weekly |
| Vendor aliases (cross-walk) | MIT (this repo) | Hand-curated YAML | ~10 entries | Edit `data/vendor_aliases.yaml` and refresh |

Every tool response carries license attribution metadata. See [LICENSES.md](./LICENSES.md) for full per-source attribution requirements.

## Requirements

- Node ≥ 18
- macOS, Linux, or Windows (cache path resolves correctly via `env-paths`)
- ~150 MB disk for the populated SQLite cache

## Install

This package is not yet on npm. Install from GitHub:

```bash
git clone https://github.com/aplaceforallmystuff/mcp-cti-glossary.git
cd mcp-cti-glossary
npm install
npm run build
npm run ingest    # ~25s — populates ~/Library/Application Support/mcp-cti-glossary/glossary.db on macOS
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

The `SourceAdapter` interface in `src/sources/_adapter.ts` is the contract for adding new sources. Each adapter implements `fetch(): Promise<RawDoc[]>` and `normalize(doc: RawDoc): Term[]`. Adding a new source is roughly: write the adapter, add a YAML/JSON fixture, write a normalize-only test, register in `scripts/ingest.ts` and `src/tools/refresh.ts`.

## Development

```bash
npm install
npm run build       # tsc → dist/
npm run watch       # tsc --watch
npm test            # vitest run (31 unit tests across 6 files)
npm run typecheck   # tsc --noEmit
npm run ingest      # populate local SQLite cache
```

Smoke-test the tool layer end-to-end against the populated DB:

```bash
npx tsx scripts/smoke-tools.ts
```

## Troubleshooting

**Server boots but Claude Code reports "no tools available."**

1. Confirm the path in your MCP config is absolute and points to `dist/index.js`, not `src/`.
2. Run `node /absolute/path/to/dist/index.js < /dev/null` from a terminal — you should see `mcp-cti-glossary v0.1.0 running on stdio` on stderr within a second. If not, the build is stale: `npm run build`.
3. Check Claude Code's MCP logs for handshake errors.

**Tools return "no results" for terms you know exist.**

The DB may be empty. Run `npm run ingest` once before first use, or call `glossary_refresh({})` from any session to populate it. `glossary_stats({})` will tell you total term count per source.

**`npm run ingest` fails with "Failed to fetch MITRE ATT&CK bundle".**

The static STIX bundle on `github.com/mitre/cti` is a 45MB download. Check your network and try again. The adapter's request times out at the default Node `fetch()` limit; if you're on a slow connection, run with `NODE_OPTIONS="--no-deprecation"` and let it retry.

**OFAC SDN ingest hangs.**

The Treasury XML feed is ~27MB and parses to ~19K records. Expect 20-30 seconds. If it stalls beyond a minute, the feed endpoint may be down — try `curl -I https://www.treasury.gov/ofac/downloads/sdn.xml` to verify reachability.

**Test failures after pulling main.**

`npm install && npm run build && npm test`. The build step is required before tests because vitest imports `dist/`-style paths in some places (NodeNext module resolution).

**FTS5 search returns no results for partial terms.**

The FTS5 query is built by quoting each whitespace-separated token. Single-character tokens won't match. Try at least three characters per token, or use `glossary_lookup` for exact matches by alias.

## Roadmap

### v1.1 (deferred from v1 to ship faster)

- **Jargon File / New Hacker's Dictionary** adapter (cultural slang corpus, ~2,500 terms)
- **NIST Glossary** adapter (security terms — needs endpoint discovery; CSRC doesn't expose a clean CSV/JSON)
- **ENISA Glossary** adapter (EU cyber terms — same endpoint discovery work needed)
- **GitHub Release artifact** for prebuilt `glossary.db`, fetched on `postinstall` to bypass first-run ingest
- **Public npm publish** as `mcp-cti-glossary-server`

### v1.2+

- Microsoft Threat Actor Naming taxonomy scraper (with snapshot tests for DOM churn)
- Mandiant + CrowdStrike vendor-naming scrapers
- Live TAXII polling instead of static STIX bundle for ATT&CK
- Optional web-search fallback for unknown terms (env-var opt-in)

### Out of scope (locked)

- Embedded vector search — exact-match FTS5 covers the operational need
- Multi-language glossaries — English-only
- Vault writeback — pure MCP server, no side effects on the user's filesystem beyond the cache DB
- Live scraping of vendor pages — legal posture is murky; we use only public alias mappings already in MITRE

## License

MIT — see [LICENSE](./LICENSE).

Source data is aggregated under the licenses listed in [LICENSES.md](./LICENSES.md). Every tool response carries attribution metadata so downstream usage stays clean (e.g. when quoting results in threat reports or briefings).

## Contributing

Bugs, PRs, and new source adapters welcome. The `SourceAdapter` interface in `src/sources/_adapter.ts` documents the contract; existing adapters (`mitre-attack.ts`, `ofac-sdn.ts`, `vendor-aliases.ts`) are the reference implementations.

If you're adding a new source, please include:

1. The adapter (`src/sources/<name>.ts`)
2. A small fixture (`test/fixtures/<name>-sample.<ext>`) — keep this small, do not redistribute the upstream corpus
3. A `normalize()` test (`test/sources/<name>.test.ts`) that validates output via `TermSchema`
4. Registration in `scripts/ingest.ts` and `src/tools/refresh.ts`
5. License entry in `LICENSES.md`

## Acknowledgements

- **MITRE Corporation** — for ATT&CK, the canonical operational CTI taxonomy
- **US Department of the Treasury / OFAC** — for the SDN list as a public-domain feed
- The cross-vendor naming community (Microsoft Threat Intelligence, Mandiant, CrowdStrike, Recorded Future, ESET, Kaspersky, SentinelOne et al.) for the cluster aliases that make threat-actor disambiguation possible
