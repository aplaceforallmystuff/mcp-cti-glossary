// ENISA Glossary HTML adapter.
//
// Scrapes the ENISA media-press-kits glossary page. Structure (as of 2026-05):
//   - 20 accordion sections grouped by alphabetical bucket
//   - <h3 class="accordion-title"> contains the FIRST term in the bucket
//   - <div class="accordion-content"> contains <p><strong>TERM</strong>: definition</p>
//
// This adapter snapshots that DOM contract. CI tests on the fixture catch
// upstream layout drift before the next live ingest fails silently.
import * as cheerio from "cheerio";
import { SourceAdapter, RawDoc, Term } from "./_adapter.js";

const ENISA_GLOSSARY_URL =
  "https://www.enisa.europa.eu/media/media-press-kits/enisa-glossary";

interface EnisaRawEntry {
  term: string;
  definition: string;
  bucket: string; // accordion title (e.g., "ABAC: accrual-based accounting")
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Split a "TERM: definition" or "TERM : definition" string into its parts.
// Returns null if the colon split looks unsafe (no clear separator).
function splitTermDefinition(text: string): { term: string; definition: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const colonMatch = trimmed.match(/^([^:]{1,80}?)\s*:\s*(.+)$/s);
  if (!colonMatch) return null;
  const term = colonMatch[1]!.trim();
  const definition = colonMatch[2]!.trim();
  if (!term || !definition) return null;
  return { term, definition };
}

/**
 * Parse the ENISA glossary HTML into a flat list of term/definition pairs.
 * Exported so tests can run against fixtures without hitting the network.
 */
export function parseEnisaGlossary(html: string): EnisaRawEntry[] {
  const $ = cheerio.load(html);
  const out: EnisaRawEntry[] = [];

  $(".accordion-title").each((_, h3) => {
    const bucketTitle = $(h3).text().trim();

    // Try to attribute the heading itself as the first term in the bucket.
    const headingPair = splitTermDefinition(bucketTitle);
    if (headingPair) {
      out.push({
        term: headingPair.term,
        definition: headingPair.definition,
        bucket: bucketTitle,
      });
    }

    // Walk forward to the matching accordion-content sibling. The DOM may
    // wrap the accordion in different parents across pages, so we look at the
    // immediate next-of-kind div with class accordion-content.
    let body: cheerio.Cheerio<any> = $(h3)
      .nextAll("div.accordion-content")
      .first();
    if (body.length === 0) {
      body = $(h3).parent().find("div.accordion-content").first();
    }

    body.find("p").each((_, p) => {
      const $p = $(p);
      const strong = $p.find("strong").first();
      if (strong.length > 0) {
        const term = strong.text().trim();
        // Definition = paragraph text minus the leading <strong> + colon
        const fullText = $p.text().trim();
        const after = fullText.slice(term.length).replace(/^\s*:\s*/, "").trim();
        if (term && after && term.length <= 80) {
          out.push({ term, definition: after, bucket: bucketTitle });
          return;
        }
      }

      // Fallback: paragraph without <strong>, parse "TERM: def" pattern.
      const fallback = splitTermDefinition($p.text());
      if (fallback) {
        out.push({ ...fallback, bucket: bucketTitle });
      }
    });
  });

  // Dedupe by lower-cased term, keep the longest definition seen.
  const byKey = new Map<string, EnisaRawEntry>();
  for (const e of out) {
    const key = e.term.toLowerCase();
    const prev = byKey.get(key);
    if (!prev || e.definition.length > prev.definition.length) {
      byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

export const enisaGlossaryAdapter: SourceAdapter = {
  meta: {
    key: "enisa-glossary",
    name: "ENISA Glossary",
    homepage: ENISA_GLOSSARY_URL,
    license: {
      name: "CC-BY-4.0",
      url: "https://www.enisa.europa.eu/copyright-and-disclaimer-notice",
      attribution:
        "ENISA Glossary, European Union Agency for Cybersecurity, used under CC-BY-4.0.",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const res = await fetch(ENISA_GLOSSARY_URL, {
      headers: {
        "User-Agent":
          "mcp-cti-glossary (+https://github.com/aplaceforallmystuff/mcp-cti-glossary)",
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ENISA glossary: ${res.status} ${res.statusText}`,
      );
    }
    const html = await res.text();
    const entries = parseEnisaGlossary(html);
    return entries.map((e) => ({
      id: `enisa:${slugify(e.term)}`,
      raw: e,
    }));
  },

  normalize(doc: RawDoc): Term[] {
    const e = doc.raw as EnisaRawEntry | null;
    if (!e || typeof e !== "object" || !e.term || !e.definition) return [];
    const term = e.term.trim();
    const definition = e.definition.trim();
    if (!term || !definition) return [];

    return [
      {
        externalId: slugify(term) || term.toLowerCase(),
        term,
        aliases: [],
        definition,
        category: "regulatory",
        metadata: {
          bucket: e.bucket,
          source: "enisa-glossary-html",
        },
      },
    ];
  },
};
