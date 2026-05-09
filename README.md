# mcp-cti-glossary

> Real-time disambiguation for cyber threat intelligence and hacker jargon, exposed as an MCP server.

An MCP server that gives Claude (and other MCP clients) a structured lookup layer across multiple authoritative cyber/security glossaries: MITRE ATT&CK, NIST, ENISA, the OFAC SDN list, the Jargon File, and a hand-curated cross-vendor threat-actor alias map.

**Status: pre-release scaffold.** Not yet published to npm. See [CHANGELOG.md](./CHANGELOG.md) for progress.

## Why

Operational CTI work is dense with overlapping vocabularies — Salt Typhoon, GhostEmperor, FamousSparrow, and UNC2286 are the same actor named by four different vendors. NICKEL is a Microsoft codename, an OFAC entity, a chemical element, and a Mandiant cluster. Each new term costs context. This server collapses that lookup cost into a single tool call, with attribution.

## Tools (planned for v1)

- `glossary_disambiguate(term, context?)` — multi-source ranked candidates for ambiguous terms
- `glossary_lookup(term, sources?)` — direct multi-source lookup
- `glossary_search(query, source?, limit?)` — full-text fuzzy search across the corpus
- `glossary_actor(name_or_alias)` — APT-specific lookup with aliases and linked ATT&CK techniques
- `glossary_technique(technique_id)` — ATT&CK technique by ID (e.g. `T1566.001`)
- `glossary_refresh(source?)` — force re-ingest of a source
- `glossary_stats()` — corpus health and last-refresh timestamps

## Sources (v1)

| Source | License | Type |
|---|---|---|
| MITRE ATT&CK (groups, software, techniques) | Apache 2.0 | Static bundle (`github.com/mitre/cti`) |
| NIST Glossary | Public Domain | CSV |
| ENISA Glossary | CC BY 4.0 | Scrape |
| Jargon File / New Hacker's Dictionary | OPL 1.0 / Public Domain (PG edition) | Static |
| OFAC SDN List | Public Domain | XML feed (refreshable) |
| Vendor aliases (cross-walk) | MIT | Hand-curated YAML |

See [LICENSES.md](./LICENSES.md) for full attribution requirements. Every tool response carries license metadata.

## Architecture

- TypeScript ES modules, `@modelcontextprotocol/sdk` v1.26+, Node ≥18
- SQLite via `better-sqlite3` with FTS5 for full-text search
- Cache lives in user data dir (`~/Library/Application Support/mcp-cti-glossary/glossary.db` on macOS)
- First-run UX: prebuilt `glossary.db` shipped as a GitHub Release artifact, fetched on `postinstall`
- Fallback: lazy local re-ingest if Release artifact unreachable

## Install (when published)

```bash
npm install -g mcp-cti-glossary-server
```

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "cti-glossary": {
      "command": "mcp-cti-glossary"
    }
  }
}
```

## Development

```bash
npm install
npm run build      # tsc → dist/
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## License

MIT — see [LICENSE](./LICENSE).

Source data is aggregated under the licenses listed in [LICENSES.md](./LICENSES.md). The server adds attribution metadata to every response so downstream usage stays clean.
