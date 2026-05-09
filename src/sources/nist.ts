// NIST CSRC Glossary source adapter.
// Fetches the daily-updated JSON export bundle from csrc.nist.gov, unzips it,
// and normalizes each parent term into a Term record.
import AdmZip from "adm-zip";
import { SourceAdapter, RawDoc, Term } from "./_adapter.js";

const NIST_GLOSSARY_URL =
  "https://csrc.nist.gov/csrc/media/glossary/glossary-export.zip";

interface NistSource {
  text?: string;
  link?: string;
  note?: string;
  refSources?: Array<{ text?: string }>;
}

interface NistDefinition {
  text?: string;
  sources?: NistSource[];
}

interface NistAbbrSyn {
  text?: string;
  link?: string;
}

interface NistParentTerm {
  term: string;
  link?: string;
  abbrSyn?: NistAbbrSyn[] | null;
  definitions?: NistDefinition[] | null;
}

interface NistExport {
  totalRecords?: number;
  comment?: string;
  parentTerms: NistParentTerm[];
}

// Strip basic HTML tags and decode common entities for clean storage.
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// NIST `link` URLs end with a slug like ".../term/kem_ciphertext".
// Use the slug as a stable externalId; fall back to a sanitized term.
function deriveExternalId(parent: NistParentTerm): string {
  if (parent.link) {
    const m = parent.link.match(/\/term\/([^/?#]+)/);
    if (m && m[1]) return m[1];
  }
  return stripHtml(parent.term)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || `term-${Math.random().toString(36).slice(2, 10)}`;
}

export const nistAdapter: SourceAdapter = {
  meta: {
    key: "nist",
    name: "NIST CSRC Glossary",
    homepage: "https://csrc.nist.gov/glossary",
    license: {
      name: "Public Domain",
      url: "https://www.nist.gov/director/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series",
      attribution:
        "NIST Computer Security Resource Center Glossary, US Department of Commerce (Public Domain).",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const response = await fetch(NIST_GLOSSARY_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch NIST glossary export: ${response.status} ${response.statusText}`,
      );
    }
    const buf = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    const jsonEntry = entries.find((e) => e.entryName.endsWith(".json"));
    if (!jsonEntry) {
      throw new Error("NIST glossary zip contained no .json entry");
    }
    const text = zip.readAsText(jsonEntry);
    // Strip BOM if present (the live export ships with one).
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const parsed = JSON.parse(clean) as NistExport;
    if (!parsed || !Array.isArray(parsed.parentTerms)) {
      throw new Error("NIST glossary export missing parentTerms array");
    }

    return parsed.parentTerms.map((pt, idx) => ({
      id: pt.link ?? `nist-${idx}`,
      raw: pt,
    }));
  },

  normalize(doc: RawDoc): Term[] {
    const pt = doc.raw as NistParentTerm | null;
    if (!pt || typeof pt !== "object" || !pt.term) return [];

    const cleanTerm = stripHtml(pt.term);
    if (!cleanTerm) return [];

    const definitions = Array.isArray(pt.definitions) ? pt.definitions : [];
    const definitionTexts = definitions
      .map((d) => (d?.text ? stripHtml(d.text) : ""))
      .filter((s) => s.length > 0);

    const abbrSyns = Array.isArray(pt.abbrSyn) ? pt.abbrSyn : [];
    const cleanedAbbrSyns = abbrSyns
      .map((a) => (a?.text ? stripHtml(a.text) : ""))
      .filter((s) => s.length > 0 && s !== cleanTerm);

    // The NIST corpus has thousands of entries where definitions === null
    // and abbrSyn carries the canonical expansion (e.g. ".csv" → "Comma-Separated
    // Value"). Treat those as alias-redirect terms instead of dropping them —
    // they're load-bearing for glossary_lookup.
    let definition: string;
    let additionalDefinitions: string[];
    if (definitionTexts.length > 0) {
      definition = definitionTexts[0]!;
      additionalDefinitions = definitionTexts.slice(1);
    } else if (cleanedAbbrSyns.length > 0) {
      definition = `See: ${cleanedAbbrSyns.join(", ")}.`;
      additionalDefinitions = [];
    } else {
      return [];
    }

    const aliasSet = new Set<string>(cleanedAbbrSyns);

    const sourceCitations = definitions
      .flatMap((d) => d?.sources ?? [])
      .map((s) => ({
        text: s.text,
        link: s.link,
        note: s.note,
      }))
      .filter((s) => s.text);

    return [
      {
        externalId: deriveExternalId(pt),
        term: cleanTerm,
        aliases: [...aliasSet],
        definition,
        category: "general",
        metadata: {
          link: pt.link,
          additionalDefinitions,
          sources: sourceCitations,
        },
      },
    ];
  },
};
