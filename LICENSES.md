# Source Licenses & Attribution

`mcp-cti-glossary` aggregates content from multiple authoritative sources. Each source retains its original license. The MCP server adds attribution metadata to every tool response.

This file is shipped with the npm package (`files: ["LICENSES.md"]` in package.json).

## Server Code

The TypeScript server code is **MIT** (see `LICENSE`).

## Source Data Licenses

### MITRE ATT&CK

- **Source:** https://github.com/mitre/cti
- **License:** Apache License 2.0
- **Attribution:** Required. Include the following in any derived work:
  > MITRE ATT&CK® and ATT&CK® are registered trademarks of The MITRE Corporation.
  > © The MITRE Corporation. This work is reproduced and distributed with the permission of The MITRE Corporation.
- **Notes:** Static bundle (`enterprise-attack.json`) is fetched and parsed at DB build time, not redistributed verbatim.

### NIST Glossary

- **Source:** https://csrc.nist.gov/glossary
- **License:** Public Domain (US government work, not subject to copyright per 17 U.S.C. § 105)
- **Attribution:** Recommended but not required.

### ENISA Glossary

- **Source:** European Union Agency for Cybersecurity (https://www.enisa.europa.eu/)
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Attribution:** Required:
  > © European Union Agency for Cybersecurity (ENISA), <year>. Licensed under CC BY 4.0.

### Jargon File / The New Hacker's Dictionary

- **Source:** http://www.catb.org/jargon/ (Eric S. Raymond, ed.) and Project Gutenberg edition (https://www.gutenberg.org/ebooks/3008)
- **License:** Open Publication License (OPL) v1.0 (with no options); Project Gutenberg edition explicitly public-domain in the United States
- **Attribution:** Required:
  > Excerpts from The Jargon File / The New Hacker's Dictionary, edited by Eric S. Raymond, are reproduced under the Open Publication License v1.0.
- **Notes:** This package uses excerpted definitions, not the full work. Cross-referenced with the Project Gutenberg public-domain edition where ambiguity exists.

### OFAC Specially Designated Nationals (SDN) List

- **Source:** US Department of the Treasury, Office of Foreign Assets Control (https://sanctionssearch.ofac.treas.gov/)
- **License:** Public Domain (US government work)
- **Attribution:** Recommended:
  > OFAC Specially Designated Nationals and Blocked Persons List, US Department of the Treasury.

### Vendor Aliases (`data/vendor_aliases.yaml`)

- **Source:** Hand-curated from public threat-actor naming taxonomies (Microsoft, Mandiant, CrowdStrike, Recorded Future, etc.)
- **License:** MIT (this package)
- **Attribution:** None required. Cross-walks public names; no proprietary vendor data is reproduced.

## Removal Requests

If a rights-holder believes content in this package exceeds fair-use or licensed-use boundaries, please open an issue at https://github.com/aplaceforallmystuff/mcp-cti-glossary/issues with the specific concern. Removal will be honored promptly pending verification.
