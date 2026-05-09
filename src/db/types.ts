// Shared database record types.
import type { TermCategory } from "../sources/_adapter.js";

export type SourceStatus = "ok" | "stale" | "error" | "unknown";
export type CrossRefKind = "alias_of" | "related" | "see_also";

export interface SourceRecord {
  id?: number;
  sourceKey: string;
  name: string;
  homepage: string;
  licenseName: string;
  licenseUrl?: string | null;
  attribution: string;
  lastRefreshedAt?: string | null;
  status: SourceStatus;
}

export interface TermInput {
  sourceId: number;
  externalId: string;
  term: string;
  definition: string;
  category: TermCategory;
  aliases: string[];
  metadata: Record<string, unknown>;
}

export interface TermSearchResult {
  id: number;
  sourceId: number;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  term: string;
  definition: string;
  category: TermCategory;
  aliases: string[];
  metadata: Record<string, unknown>;
  rank: number | null;
  attribution: string;
}

export interface TermFull extends Omit<TermSearchResult, "rank"> {
  createdAt: string;
  updatedAt: string;
}

export interface CrossRefRecord {
  id: number;
  termId: number;
  sourceId: number;
  sourceKey: string;
  sourceName: string;
  externalId: string;
  term: string;
  definition: string;
  category: TermCategory;
  kind: CrossRefKind;
  confidence: number;
  attribution: string;
}
