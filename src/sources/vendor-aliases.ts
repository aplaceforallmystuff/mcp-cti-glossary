// Vendor aliases source adapter — loads hand-curated YAML cross-vendor naming.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { load as parseYaml } from "js-yaml";
import { SourceAdapter, RawDoc, Term, TermCategory, TermSchema } from "./_adapter.js";

interface VendorAliasEntry {
  external_id: string;
  category: TermCategory;
  term: string;
  aliases?: string[];
  definition: string;
  metadata?: Record<string, unknown>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_YAML_PATH = resolve(__dirname, "..", "..", "data", "vendor_aliases.yaml");

export const vendorAliasesAdapter: SourceAdapter = {
  meta: {
    key: "vendor-aliases",
    name: "Vendor Aliases (cross-walk)",
    homepage: "https://github.com/aplaceforallmystuff/mcp-cti-glossary",
    license: {
      name: "MIT",
      attribution:
        "Hand-curated cross-vendor threat-actor naming, mcp-cti-glossary (MIT).",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const yamlPath = process.env.VENDOR_ALIASES_PATH ?? DEFAULT_YAML_PATH;
    const text = await readFile(yamlPath, "utf8");
    const parsed = parseYaml(text);
    if (!Array.isArray(parsed)) {
      throw new Error(`vendor-aliases: expected top-level array, got ${typeof parsed}`);
    }
    return parsed.map((entry, idx) => ({
      id: typeof (entry as VendorAliasEntry).external_id === "string"
        ? (entry as VendorAliasEntry).external_id
        : `entry-${idx}`,
      raw: entry,
    }));
  },

  normalize(doc: RawDoc): Term[] {
    if (!doc.raw || typeof doc.raw !== "object") return [];
    const e = doc.raw as VendorAliasEntry;
    if (!e.external_id || !e.term || !e.definition || !e.category) return [];

    const term: Term = {
      externalId: e.external_id,
      term: e.term,
      aliases: Array.isArray(e.aliases) ? [...new Set(e.aliases.filter((a) => a !== e.term))] : [],
      definition: e.definition.trim(),
      category: e.category,
      metadata: (e.metadata && typeof e.metadata === "object") ? e.metadata : {},
    };

    const result = TermSchema.safeParse(term);
    return result.success ? [term] : [];
  },
};
