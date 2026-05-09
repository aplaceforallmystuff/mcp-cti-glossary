# Contributing to mcp-cti-glossary

Bugs, PRs, and new source adapters all welcome.

## Getting Started

```bash
git clone https://github.com/aplaceforallmystuff/mcp-cti-glossary.git
cd mcp-cti-glossary
npm install
npm run build
npm test
```

If you're going to test the tools end-to-end:

```bash
npm run ingest                    # populates the local SQLite cache
npx tsx scripts/smoke-tools.ts    # exercises each tool against real data
```

## Development Loop

| Command | What it does |
|---|---|
| `npm run watch` | `tsc --watch` — incremental TypeScript builds |
| `npm test` | `vitest run` — full test suite (currently 31 tests) |
| `npm run test:watch` | vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit` — type check only, no output |
| `npm run ingest` | Run all adapters and populate the local SQLite DB |

## Adding a New Source Adapter

The `SourceAdapter` interface in `src/sources/_adapter.ts` is the contract. Existing adapters (`mitre-attack.ts`, `ofac-sdn.ts`, `vendor-aliases.ts`) are reference implementations of three different shapes (STIX JSON, XML feed, hand-curated YAML).

To add a new source:

1. **Implement the adapter** at `src/sources/<name>.ts`. Export a `SourceAdapter` const with `meta`, `fetch()`, and `normalize()`.
2. **Add a small fixture** at `test/fixtures/<name>-sample.<ext>`. Keep this small — do not redistribute the upstream corpus. Pick representative entries that exercise edge cases (single vs multiple aliases, missing optional fields, etc.).
3. **Write a normalize-only test** at `test/sources/<name>.test.ts`. Exercise `normalize()` against the fixture; do NOT make network calls in tests. Validate output via `TermSchema.parse()` — every Term must be schema-valid.
4. **Register the adapter** in:
   - `scripts/ingest.ts` — so `npm run ingest` includes it
   - `src/tools/refresh.ts` — so `glossary_refresh` can target it by source key
5. **Add license entry** to `LICENSES.md` — every source needs a license, an attribution string, and a removal-request channel.
6. **Verify gates pass:** `npm run build && npm run typecheck && npm test`.

## Adding a New Tool

One file per tool in `src/tools/`. Each exports a `ToolHandler` with:

- `definition` — MCP `Tool` shape (name, description, JSON Schema)
- `inputSchema` — Zod schema (used for runtime validation in `src/index.ts`)
- `handle(db, input)` — async handler returning `CallToolResult`

Then register in `src/tools/index.ts`. The wiring in `src/index.ts` is automatic.

## Code Style

- TypeScript strict mode — no `any` except for `unknown` casts at external-data boundaries
- ES modules with `.js` extensions in import paths (NodeNext module resolution)
- One-line file headers — no multi-paragraph docstrings
- Conventional Commits for messages (`feat(scope): description`)
- Co-Authored-By: trailers when AI agents (Claude / Codex / Gemini) contributed

## Submitting Changes

1. Fork the repo and create a feature branch (`feat/my-source-adapter` or `fix/ofac-individual-name`).
2. Run the full gate locally: `npm run build && npm run typecheck && npm test`.
3. If you added a new source, run `npm run ingest` and confirm the term count is reasonable.
4. Push your branch and open a PR. Describe the change, the source (if applicable), and any licensing concerns.
5. CI runs the same gates on Node 18, 20, and 22.

## Licensing of Source Data

If you add a source, the data license **must** be one of:

- Public domain (US government works, etc.)
- Apache-2.0
- MIT
- BSD
- Creative Commons Attribution (CC BY)
- Open Publication License (OPL)
- A license that explicitly permits redistribution and derivative works

Sources with restrictive licenses (proprietary, no-derivatives, or vendor pages with unclear posture) cannot be included. The repo is MIT-licensed; aggregated source data must be compatible.

## Reporting Issues

Open a GitHub issue with:

- What you ran
- What you expected
- What happened
- Output of `glossary_stats({})` if relevant
- Node version and OS
