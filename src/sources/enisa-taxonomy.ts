// ENISA threat-taxonomy adapter (sourced from MISP/misp-taxonomies).
//
// Complements the ENISA glossary HTML adapter with structured threat-type
// classifications (nefarious-activity-abuse, eavesdropping, physical-attack,
// disaster, failures-malfunction, outages, damage-loss, legal). License is
// CC0-1.0 / BSD-2-Clause (dual) — safe to redistribute.
import { SourceAdapter, RawDoc, Term } from "./_adapter.js";

const ENISA_TAXONOMY_URL =
  "https://raw.githubusercontent.com/MISP/misp-taxonomies/main/enisa/machinetag.json";

interface MispMachinetagEntry {
  value: string;
  expanded?: string;
  description?: string;
  uuid?: string;
  numerical_value?: number;
}

interface MispMachinetagPredicate {
  value: string;
  expanded?: string;
  description?: string;
  uuid?: string;
}

interface MispMachinetag {
  namespace: string;
  description?: string;
  version?: number;
  expanded?: string;
  uuid?: string;
  predicates: MispMachinetagPredicate[];
  values: Array<{
    predicate: string;
    entry: MispMachinetagEntry[];
  }>;
}

interface FlatRow {
  predicate: MispMachinetagPredicate;
  entry: MispMachinetagEntry;
}

export const enisaTaxonomyAdapter: SourceAdapter = {
  meta: {
    key: "enisa-taxonomy",
    name: "ENISA Threat Taxonomy (MISP)",
    homepage: "https://github.com/MISP/misp-taxonomies/tree/main/enisa",
    license: {
      name: "CC0-1.0",
      url: "https://github.com/MISP/misp-taxonomies/blob/main/LICENSE",
      attribution:
        "ENISA threat taxonomy via MISP/misp-taxonomies, dual-licensed CC0-1.0 / BSD-2-Clause.",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const res = await fetch(ENISA_TAXONOMY_URL);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ENISA taxonomy: ${res.status} ${res.statusText}`,
      );
    }
    const data = (await res.json()) as MispMachinetag;
    if (!data?.predicates || !data?.values) {
      throw new Error("ENISA taxonomy: missing predicates/values");
    }

    const predicateByValue = new Map<string, MispMachinetagPredicate>();
    for (const p of data.predicates) {
      predicateByValue.set(p.value, p);
    }

    const docs: RawDoc[] = [];
    for (const group of data.values) {
      const predicate = predicateByValue.get(group.predicate);
      if (!predicate) continue;
      for (const entry of group.entry) {
        const id =
          entry.uuid ??
          `${data.namespace}:${group.predicate}:${entry.value}`;
        docs.push({ id, raw: { predicate, entry } satisfies FlatRow });
      }
    }
    return docs;
  },

  normalize(doc: RawDoc): Term[] {
    if (!doc.raw || typeof doc.raw !== "object") return [];
    const row = doc.raw as FlatRow;
    if (!row.entry?.value || !row.predicate?.value) return [];

    const expanded = row.entry.expanded?.trim();
    const term = expanded && expanded.length > 0 ? expanded : row.entry.value;
    const definition = (row.entry.description ?? row.entry.expanded ?? row.entry.value)
      .trim();
    if (!term || !definition) return [];

    const aliasSet = new Set<string>();
    if (row.entry.value && row.entry.value !== term) aliasSet.add(row.entry.value);

    return [
      {
        externalId: row.entry.uuid ??
          `enisa-taxonomy:${row.predicate.value}:${row.entry.value}`,
        term,
        aliases: [...aliasSet],
        definition,
        category: "regulatory",
        metadata: {
          predicate: row.predicate.value,
          predicateExpanded: row.predicate.expanded,
          predicateDescription: row.predicate.description,
          machinetag: `enisa:${row.predicate.value}="${row.entry.value}"`,
          source: "misp-taxonomies/enisa",
        },
      },
    ];
  },
};
