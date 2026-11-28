/**
 * Contract: legal (owner: L3, terms acceptance). The registry of legal
 * document versions and acceptances of any document key and version: who
 * accepted, on whose behalf (a managed minor, an organisation), when, where
 * (surface, locale) and the exact text (document hash). IP address and user
 * agent are captured server-side as evidence and never returned. Frozen by
 * W3-0; procedures `public.legal.*`, `player.legal.*`, `operator.legal.*`
 * (see docs/plan/w3-contracts.md).
 */
import {
  LEGAL_DOCUMENT_KEY_PATTERN,
  legalAcceptanceSurfaces,
  legalAcceptedAs,
  legalDocumentAudiences,
} from "@duna/db/schema";
import { z } from "zod";
import { w3DateTimeSchema, w3IdSchema, w3PersonRefSchema } from "./w3-common";

export const legalDocumentKeySchema = z
  .string()
  .regex(new RegExp(LEGAL_DOCUMENT_KEY_PATTERN));
export const legalDocumentVersionStringSchema = z.string().min(1).max(32);
export const legalSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const legalAudienceSchema = z.enum(legalDocumentAudiences);
export const legalAcceptedAsSchema = z.enum(legalAcceptedAs);
export const legalSurfaceSchema = z.enum(legalAcceptanceSurfaces);
/** `legal_acceptances.acceptance_method` (CHECK in 0038). */
export const legalAcceptanceMethodSchema = z.enum([
  "clickwrap",
  "signed-order-form",
  "admin-import",
]);
export const legalRequirementStateSchema = z.enum([
  "accepted",
  "needs-acceptance",
  "needs-reacceptance",
]);

export const legalDocumentVersionSchema = z.object({
  id: w3IdSchema,
  documentKey: legalDocumentKeySchema,
  version: legalDocumentVersionStringSchema,
  title: z.string().min(1),
  audience: legalAudienceSchema,
  contentHash: legalSha256Schema,
  url: z.string().startsWith("/legal"),
  publishedAt: w3DateTimeSchema,
  effectiveAt: w3DateTimeSchema,
  requiresReacceptance: z.boolean(),
});

export const legalDocumentsInputSchema = z.object({
  audience: legalAudienceSchema.optional(),
});
export const legalDocumentInputSchema = z.object({
  documentKey: legalDocumentKeySchema,
  /** Omit for the current effective version. */
  version: legalDocumentVersionStringSchema.optional(),
});

export const legalAcceptanceSchema = z.object({
  id: w3IdSchema,
  documentKey: legalDocumentKeySchema,
  documentVersion: legalDocumentVersionStringSchema,
  documentHash: legalSha256Schema.optional(),
  acceptedAs: legalAcceptedAsSchema,
  person: w3PersonRefSchema,
  onBehalfOf: w3PersonRefSchema.optional(),
  organizationId: w3IdSchema.optional(),
  surface: legalSurfaceSchema.optional(),
  locale: z.string().max(16).optional(),
  acceptanceMethod: legalAcceptanceMethodSchema,
  acceptedAt: w3DateTimeSchema,
});

/** What a person (or a minor they manage) still has to accept. */
export const legalRequirementSchema = z.object({
  documentKey: legalDocumentKeySchema,
  title: z.string().min(1),
  currentVersion: legalDocumentVersionStringSchema,
  url: z.string().startsWith("/legal"),
  contentHash: legalSha256Schema,
  state: legalRequirementStateSchema,
  acceptedVersion: legalDocumentVersionStringSchema.optional(),
  forPerson: w3PersonRefSchema.optional(),
});
export const legalRequirementsInputSchema = z.object({
  surface: legalSurfaceSchema.optional(),
  /** A managed minor's requirements, accepted by their guardian. */
  forPersonId: w3IdSchema.optional(),
});

export const legalAcceptDocumentSchema = z.object({
  documentKey: legalDocumentKeySchema,
  version: legalDocumentVersionStringSchema,
  /** The hash of the text the person was shown; must match the registry. */
  documentHash: legalSha256Schema,
});
export const legalAcceptInputSchema = z.object({
  documents: z.array(legalAcceptDocumentSchema).min(1).max(16),
  /** A guardian accepting for a managed minor (accepted_as = guardian). */
  onBehalfOfPersonId: w3IdSchema.optional(),
  surface: legalSurfaceSchema.exclude(["admin-import"]),
  locale: z.string().max(16).optional(),
  appVersion: z.string().max(32).optional(),
});

/** HQ: an authorised person accepts for the organisation (accepted_as = organization-authority). */
export const legalOrganizationAcceptInputSchema = z.object({
  documents: z.array(legalAcceptDocumentSchema).min(1).max(4),
  surface: z.enum(["hq-onboarding", "hq-settings"]),
  locale: z.string().max(16).optional(),
});

export type LegalDocumentVersion = z.infer<typeof legalDocumentVersionSchema>;
export type LegalAcceptance = z.infer<typeof legalAcceptanceSchema>;
export type LegalRequirement = z.infer<typeof legalRequirementSchema>;
