// Source adapter contract for glossary ingestion.
import { z } from "zod";

export type TermCategory =
  | "cultural"
  | "cti_actor"
  | "cti_technique"
  | "cti_software"
  | "cti_tactic"
  | "regulatory"
  | "general";

export interface SourceLicense {
  name: string;
  url?: string;
  attribution: string;
}

export interface SourceMetadata {
  key: string;
  name: string;
  homepage: string;
  license: SourceLicense;
}

export interface RawDoc {
  id: string;
  raw: unknown;
}

export interface Term {
  externalId: string;
  term: string;
  aliases: string[];
  definition: string;
  category: TermCategory;
  metadata: Record<string, unknown>;
}

export interface SourceAdapter {
  readonly meta: SourceMetadata;
  fetch(): Promise<RawDoc[]>;
  normalize(doc: RawDoc): Term[];
}

export const TermCategorySchema = z.enum([
  "cultural",
  "cti_actor",
  "cti_technique",
  "cti_software",
  "cti_tactic",
  "regulatory",
  "general",
]);

export const TermSchema: z.ZodType<Term> = z.object({
  externalId: z.string().min(1),
  term: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  definition: z.string().min(1),
  category: TermCategorySchema,
  metadata: z.record(z.unknown()),
});

export const SourceMetadataSchema: z.ZodType<SourceMetadata> = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  homepage: z.string().url(),
  license: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    attribution: z.string().min(1),
  }),
});
