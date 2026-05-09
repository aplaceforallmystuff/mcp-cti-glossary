// Jargon File source adapter — cultural hacker slang.
//
// Sources the Project Gutenberg edition of Eric S. Raymond / Guy L. Steele's
// Jargon File (v4.2.2, 2000). The canonical updated edition lives at
// catb.org/jargon/html/ but is split across ~2,500 separate HTML pages, which
// makes it slow and brittle to ingest. The Project Gutenberg edition is a
// single plain-text file and is explicitly public-domain in the US, while
// the upstream is OPL-1.0 — we honour both attributions in the metadata.
//
// Entry format (roughly):
//
//   Node:<term>, Next:<n>, Previous:<p>, Up:= L =
//
//   <headword> [pronunciation] <part-of-speech>.
//
//   <definition body — may span multiple paragraphs until next Node: marker>
//
// Section headers (Node:= 0 =, Node:Top, Node:Introduction, etc.) are skipped.
import { SourceAdapter, RawDoc, Term } from "./_adapter.js";

const JARGON_FILE_URL = "https://www.gutenberg.org/cache/epub/3008/pg3008.txt";

interface ParsedEntry {
  /** Term as it appears in `Node:<term>,` — the canonical headword. */
  term: string;
  /** Pronunciation guide between slashes (e.g. /grep/), if present. */
  pronunciation?: string;
  /** Part-of-speech marker (n., v., adj., etc.), if present. */
  partOfSpeech?: string;
  /** Etymology / bracketed origin note, if present. */
  etymology?: string;
  /** Body text — paragraphs joined by blank lines. */
  definition: string;
}

const NODE_MARKER = /^Node:/m;

// Section headings are Node entries whose name is `= X =` or one of the
// front-matter pages. These should be filtered out.
const FRONT_MATTER_NAMES = new Set([
  "Top",
  "Introduction",
  "A Few Terms",
  "Revision History",
  "Jargon Construction",
  "Verb Doubling",
  "Soundalike Slang",
  "The -P Convention",
  "Overgeneralization",
  "Spoken inarticulations",
  "Anthropomorphization",
  "Comparatives",
  "Hacker Speech Style",
  "International Style",
  "Email Quotes and Inclusion Conventions",
  "Hacker Writing Style",
  "Pronunciation Guide",
  "Other Lexicon Conventions",
  "Format for New Entries",
  "How Jargon Works",
  "The Jargon Lexicon",
  "Crackers, Phreaks, and Lamers",
  "Pop Culture",
]);

function isSectionHeading(name: string): boolean {
  if (FRONT_MATTER_NAMES.has(name.trim())) return true;
  if (/^=\s/.test(name.trim())) return true; // Node:= 0 =, Node:= A =, etc.
  return false;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Parse the Project Gutenberg Jargon File text into structured entries.
 * Exported for unit testing without going to the network.
 */
export function parseJargonFile(text: string): ParsedEntry[] {
  // Strip Project Gutenberg's front and back matter so we don't accidentally
  // match Node: markers in their own metadata.
  const startIdx = text.search(/^\*\*\* START OF/m);
  const endIdx = text.search(/^\*\*\* END OF/m);
  const body = text.slice(
    startIdx >= 0 ? startIdx : 0,
    endIdx >= 0 ? endIdx : text.length,
  );

  // Split on Node: markers. The first chunk before any Node: is preamble.
  const chunks = body.split(NODE_MARKER).slice(1);

  const out: ParsedEntry[] = [];
  for (const chunk of chunks) {
    // Header may span multiple lines (continuation by trailing comma).
    // Header ends at the first blank line.
    const blankIdx = chunk.search(/\n\s*\n/);
    if (blankIdx === -1) continue;

    const header = chunk.slice(0, blankIdx).replace(/\s+/g, " ").trim();
    const rest = chunk.slice(blankIdx).replace(/^\s*\n+/, "");

    // Header form: "<term>, Next:..., Previous:..., Up:..."
    const termMatch = header.match(/^([^,]+),/);
    if (!termMatch) continue;
    const term = termMatch[1]!.trim();
    if (!term || isSectionHeading(term)) continue;

    // Body: split into paragraphs (blank-line delimited). Skip empties.
    const paragraphs = rest
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length === 0) continue;

    // First paragraph is "<headword> [/pronunciation/] <pos>." — pull out
    // the pronunciation and part-of-speech from it. The rest of paragraphs
    // are the definition body.
    const firstPara = paragraphs[0]!;
    let pronunciation: string | undefined;
    let partOfSpeech: string | undefined;
    let etymology: string | undefined;

    // Look for /.../ pronunciation
    const pronMatch = firstPara.match(/\/([^/]{1,40})\//);
    if (pronMatch) pronunciation = pronMatch[1]!.trim();

    // Look for trailing POS tokens after the headword and pronunciation.
    // The Jargon File uses compound forms freely: "excl.,n.,v.", "n.,v.",
    // "vi.", "vt.", "adj.", "adv.", "interj.", "prov.", etc. Match a run of
    // such tokens at end of the first paragraph.
    const posToken =
      "(?:vi\\.|vt\\.|vb\\.|n\\.|v\\.|adj\\.|adv\\.|interj\\.|prov\\.|imp\\.|excl\\.|exclam\\.|conj\\.|prep\\.|abbr\\.|pron\\.|imperative)";
    const posMatch = firstPara.match(
      new RegExp(`(?:${posToken}[,\\s]*)+\\s*$`, "i"),
    );
    if (posMatch) partOfSpeech = posMatch[0]!.trim().replace(/[\s,]+$/, "");

    // Etymology often starts the definition body in [brackets]. When found,
    // strip the bracket from the definition so the same content isn't stored
    // twice (once in metadata.etymology and once in the body).
    const defParas = paragraphs.slice(1);
    if (defParas[0]) {
      const etyMatch = defParas[0].match(/^\[([^\]]+)\]\s*/);
      if (etyMatch) {
        etymology = etyMatch[1]!.trim();
        defParas[0] = defParas[0].slice(etyMatch[0].length).trim();
        if (defParas[0].length === 0) defParas.shift();
      }
    }

    const definition = defParas.join("\n\n").trim();
    if (definition.length === 0) continue;

    out.push({
      term,
      pronunciation,
      partOfSpeech,
      etymology,
      definition,
    });
  }

  return out;
}

export const jargonFileAdapter: SourceAdapter = {
  meta: {
    key: "jargon-file",
    name: "Jargon File / The New Hacker's Dictionary",
    homepage: "http://www.catb.org/jargon/",
    license: {
      name: "OPL-1.0 (Project Gutenberg edition: Public Domain in US)",
      url: "https://www.gutenberg.org/ebooks/3008",
      attribution:
        "The Jargon File / The New Hacker's Dictionary, Eric S. Raymond (ed.), Guy L. Steele. Project Gutenberg edition (eBook #3008), public-domain in the United States; upstream catb.org edition under Open Publication License v1.0.",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const res = await fetch(JARGON_FILE_URL, {
      headers: {
        "User-Agent":
          "mcp-cti-glossary (+https://github.com/aplaceforallmystuff/mcp-cti-glossary)",
        Accept: "text/plain",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch Jargon File: ${res.status} ${res.statusText}`,
      );
    }
    const text = await res.text();
    const parsed = parseJargonFile(text);
    return parsed.map((entry) => ({
      id: `jargon:${slugify(entry.term) || entry.term}`,
      raw: entry,
    }));
  },

  normalize(doc: RawDoc): Term[] {
    if (!doc.raw || typeof doc.raw !== "object") return [];
    const e = doc.raw as ParsedEntry;
    if (!e.term || !e.definition) return [];

    const term = e.term.trim();
    const definition = e.definition.trim();
    if (!term || !definition) return [];

    return [
      {
        externalId: slugify(term) || term.toLowerCase(),
        term,
        aliases: [],
        definition,
        category: "cultural",
        metadata: {
          pronunciation: e.pronunciation,
          partOfSpeech: e.partOfSpeech,
          etymology: e.etymology,
        },
      },
    ];
  },
};
