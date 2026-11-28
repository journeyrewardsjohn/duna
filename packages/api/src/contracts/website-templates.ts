/**
 * Contract: website-templates (owner: B8b). The five site templates and how a
 * club's site starts: from a template, or by onboarding the club's existing
 * site with a few questions. Frozen by W3-0: B8b implements the service; H12
 * builds WT-Templates, WN-* and WO-* against these shapes and
 * `@duna/core/demo/website-templates`. Procedures:
 * `operator.websiteTemplates.*`, `public.websiteTemplates.*`
 * (docs/plan/w3-contracts.md).
 */
import { websiteSiteOrigins, websiteTemplateStatuses } from "@duna/db/schema";
import { z } from "zod";
import { w3DateTimeSchema, w3IdSchema } from "./w3-common";

export const websiteTemplatesStatusSchema = z.enum(websiteTemplateStatuses);
export const websiteTemplatesOriginSchema = z.enum(websiteSiteOrigins);

export const websiteTemplatesTemplateSchema = z.object({
  templateId: w3IdSchema,
  key: z.string().regex(/^[a-z0-9-]+$/),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().min(1),
  status: websiteTemplatesStatusSchema,
  previewImageUrl: z.string().startsWith("/").optional(),
  /** Page paths the template creates, for the picker. */
  pagePaths: z.array(z.string().startsWith("/")),
});
export const websiteTemplatesListInputSchema = z.object({
  /** Operators may ask for drafts and retired templates (Super Admin view). */
  includeUnavailable: z.boolean().default(false),
});
export const websiteTemplatesListSchema = z.object({
  templates: z.array(websiteTemplatesTemplateSchema),
});

/** Onboarding answers (WO-1 … WO-8), keyed by question. */
export const websiteTemplatesAnswersSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  z.union([
    z.string().max(2000),
    z.boolean(),
    z.array(z.string().max(200)).max(20),
  ]),
);

export const websiteTemplatesSiteStartSchema = z.object({
  siteId: w3IdSchema,
  origin: websiteTemplatesOriginSchema,
  templateId: w3IdSchema.optional(),
  templateName: z.string().optional(),
  existingSiteUrl: z.url().optional(),
  answers: websiteTemplatesAnswersSchema,
  /** Questions still to answer before the first Change is built. */
  remainingQuestions: z.array(
    z.object({ key: z.string().min(1), prompt: z.string().min(1) }),
  ),
  completedAt: w3DateTimeSchema.optional(),
});

export const websiteTemplatesStartInputSchema = z.discriminatedUnion("origin", [
  z.object({
    origin: z.literal("template"),
    siteName: z.string().trim().min(1).max(120),
    templateId: w3IdSchema,
  }),
  z.object({
    origin: z.literal("existing-site"),
    siteName: z.string().trim().min(1).max(120),
    existingSiteUrl: z.url(),
  }),
]);
export const websiteTemplatesSiteInputSchema = z.object({ siteId: w3IdSchema });
export const websiteTemplatesSaveAnswersInputSchema = z.object({
  siteId: w3IdSchema,
  answers: websiteTemplatesAnswersSchema,
});

export type WebsiteTemplatesTemplate = z.infer<
  typeof websiteTemplatesTemplateSchema
>;
export type WebsiteTemplatesSiteStart = z.infer<
  typeof websiteTemplatesSiteStartSchema
>;
