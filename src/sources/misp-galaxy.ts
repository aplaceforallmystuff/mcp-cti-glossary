// MISP Galaxy threat-actor + microsoft-activity-group adapter.
//
// Pulls the canonical threat-actor and microsoft-activity-group cluster files
// from MISP/misp-galaxy. Adds substantial vendor cross-walk coverage that
// MITRE ATT&CK alone does not provide (e.g. Microsoft Typhoon/Sandstorm
// codenames, CrowdStrike "Panda/Bear" naming, Mandiant "APT" tags).
//
// Licensed under CC0 / BSD-2-Clause (dual). Safe to redistribute.
import { SourceAdapter, RawDoc, Term, TermCategory } from "./_adapter.js";

interface MispGalaxyValue {
  uuid: string;
  value: string;
  description?: string;
  meta?: {
    synonyms?: string[];
    country?: string;
    refs?: string[];
    [k: string]: unknown;
  };
  related?: Array<{
    "dest-uuid"?: string;
    type?: string;
  }>;
}

interface MispGalaxyCluster {
  uuid: string;
  name: string;
  description?: string;
  source?: string;
  category?: string;
  type: string;
  version?: number;
  authors?: string[];
  values: MispGalaxyValue[];
}

interface ClusterSource {
  url: string;
  /** Surfaced in metadata.cluster so consumers can tell the two apart. */
  cluster: "threat-actor" | "microsoft-activity-group";
}

const CLUSTERS: ClusterSource[] = [
  {
    url: "https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json",
    cluster: "threat-actor",
  },
  {
    url: "https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/microsoft-activity-group.json",
    cluster: "microsoft-activity-group",
  },
];

export const mispGalaxyAdapter: SourceAdapter = {
  meta: {
    key: "misp-galaxy",
    name: "MISP Galaxy (threat-actor + Microsoft activity groups)",
    homepage: "https://github.com/MISP/misp-galaxy",
    license: {
      name: "CC0-1.0",
      url: "https://github.com/MISP/misp-galaxy/blob/main/LICENSE",
      attribution:
        "MISP Galaxy clusters © MISP Project contributors, dual-licensed CC0-1.0 / BSD-2-Clause.",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const docs: RawDoc[] = [];
    for (const c of CLUSTERS) {
      const res = await fetch(c.url);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch MISP galaxy cluster ${c.cluster}: ${res.status} ${res.statusText}`,
        );
      }
      const cluster = (await res.json()) as MispGalaxyCluster;
      if (!cluster?.values || !Array.isArray(cluster.values)) continue;
      for (const v of cluster.values) {
        docs.push({
          id: `${c.cluster}:${v.uuid}`,
          raw: { value: v, cluster: c.cluster, clusterMeta: {
            uuid: cluster.uuid,
            name: cluster.name,
            source: cluster.source,
            version: cluster.version,
          } },
        });
      }
    }
    return docs;
  },

  normalize(doc: RawDoc): Term[] {
    if (!doc.raw || typeof doc.raw !== "object") return [];
    const wrapper = doc.raw as {
      value: MispGalaxyValue;
      cluster: ClusterSource["cluster"];
      clusterMeta: { uuid: string; name: string; source?: string; version?: number };
    };
    const v = wrapper.value;
    if (!v || !v.uuid || !v.value) return [];

    const term = v.value.trim();
    if (!term) return [];

    const synonyms = Array.isArray(v.meta?.synonyms) ? v.meta!.synonyms : [];
    const aliasSet = new Set(
      synonyms
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== term),
    );

    const definition = (v.description ?? "").trim() ||
      `${term} — threat actor cluster from MISP Galaxy ${wrapper.cluster}.`;

    const category: TermCategory = "cti_actor";

    // Surface ATT&CK linkage when present so consumers can cross-walk.
    const attackGroupRefs = (v.related ?? [])
      .filter((r) => r.type === "similar")
      .map((r) => r["dest-uuid"])
      .filter((u): u is string => typeof u === "string");

    return [
      {
        externalId: v.uuid,
        term,
        aliases: [...aliasSet],
        definition,
        category,
        metadata: {
          cluster: wrapper.cluster,
          country: v.meta?.country,
          refs: v.meta?.refs ?? [],
          relatedUuids: attackGroupRefs,
          galaxy: {
            uuid: wrapper.clusterMeta.uuid,
            name: wrapper.clusterMeta.name,
            source: wrapper.clusterMeta.source,
            version: wrapper.clusterMeta.version,
          },
        },
      },
    ];
  },
};
