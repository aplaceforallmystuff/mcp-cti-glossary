# CLAUDE.md — mcp-cti-glossary

Project-specific notes for Claude Code sessions in this repo.

## What this is

An MCP server that aggregates cyber threat intelligence glossaries (MITRE ATT&CK, NIST, ENISA, Jargon File, OFAC SDN, vendor aliases) and exposes them via 7 tools for real-time disambiguation. Built primarily to support Jim's hack.lu 2026 CFP work but durable across all security work.

## Stack & conventions

- **TypeScript ES modules** (`"type": "module"` in package.json)
- **MCP SDK:** `@modelcontextprotocol/sdk` ^1.26.0
- **Compiler:** `tsc` directly (no bundler)
- **Test framework:** `vitest`
- **Storage:** SQLite via `better-sqlite3` with FTS5 virtual tables (added in Phase 1)
- **Schema validation:** Zod + `zod-to-json-schema` for tool input schemas (added in Phase 3)
- **MCP API style:** low-level `Server` class with `setRequestHandler()` (mirrors `~/Dev/mcp-threatintel/src/index.ts`)
- **Node:** ≥18
- **License:** MIT

## Reference siblings

When unsure about pattern, consult these existing MCP servers in `~/Dev/`:

- `~/Dev/mcp-threatintel` — closest pattern match. Low-level Server API, dynamic tool registration, single-file `src/index.ts` for entry. Mirror its `.github/workflows/ci.yml` and `package.json` field conventions.
- `~/Dev/mcp-wisdom` — module-per-domain pattern. Mirror its split into `src/sources/*.ts` for adapter implementations.

## Repo structure

```
src/
├── index.ts          # Server entry + tool registration
├── tools/            # One file per MCP tool
├── db/               # SQLite schema, migrations, queries
├── sources/          # SourceAdapter implementations (one per source)
│   └── _adapter.ts   # Load-bearing interface — must land before parallel adapter work
├── ingest/           # Orchestrator + postinstall DB fetcher
└── lib/              # Shared utilities (cache paths, attribution helper)
data/                 # vendor_aliases.yaml (shipped in npm package)
scripts/              # build-db.ts (CI artifact builder)
test/                 # vitest test suites
```

## Phase plan (current)

Tracked in detail at `~/.claude/plans/splendid-honking-emerson.md`.

| Phase | Description | Lead |
|---|---|---|
| 0 | Repo bootstrap | Claude (direct — orchestration override; was Codex in original plan) |
| 1 | DB layer + SourceAdapter interface | Codex |
| 2 | Source adapters × 5 (Jargon, NIST, ENISA, MITRE, OFAC) | Gemini parallel × 5 |
| 0.5 | Prebuilt DB pipeline + GitHub Release artifact | Claude |
| 3 | MCP tool layer (7 tools) | Codex |
| 4 | Test suite | Gemini fixtures + Codex harness + Claude verification |
| 5 | Docs (README, CHANGELOG, examples) | Claude |
| 6 | First public release `v0.1.0` via `publish-mcp` skill | Claude |

## Critical sequencing rule

The `SourceAdapter` interface in `src/sources/_adapter.ts` (Phase 1, Codex-authored) **must land and be reviewed before Phase 2 fans out** to parallel Gemini work. Without a stable contract, parallel adapter authoring produces incompatible parsers.

## Source licensing

Every source has its own license; see `LICENSES.md`. Tool responses must include attribution metadata. Do NOT redistribute vendor pages (Microsoft/Mandiant/CrowdStrike threat actor naming) verbatim — use only the public alias mappings already in MITRE ATT&CK plus the hand-curated `data/vendor_aliases.yaml`.

## Quality gates

Pre-publish checks (enforced by `publish-mcp` skill):
- `tsc --noEmit` clean
- `vitest run` all green
- `npm audit --omit=dev` clean
- `prep-repo` skill clean (no exposed secrets, README/LICENSE/CHANGELOG present)
- `sanitize-for-publish` clean

## Out of scope

- Embedded vector search (FTS5 covers the operational need)
- Multi-language glossaries (English-only)
- Vault writeback (locked decision — pure MCP server)
- Live vendor-page scraping (deferred to v1.1; legal posture is murky)
