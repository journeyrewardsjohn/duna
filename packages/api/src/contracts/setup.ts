/**
 * Contract: setup (owner: B1). Organisation profile and AI setup from a
 * website address. Frozen by W3-0: B1 implements the service behind these
 * shapes; H11 builds the UI against them and the demo fixtures in
 * `@duna/core/demo/setup`. Procedures: `operator.setup.*` (see
 * docs/plan/w3-contracts.md).
 */
import {
  setupFieldSources,
  setupProposalCategories,
  setupProposalDecisions,
  setupRunOutcomes,
  setupRunPageStatuses,
  setupRunSourceKinds,
  setupRunStatuses,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateTimeSchema,
  w3IdSchema,
  w3TimeOfDaySchema,
  w3WeekdaySchema,
} from "./w3-common";

export const setupRunSourceKindSchema = z.enum(setupRunSourceKinds);
export const setupRunStatusSchema = z.enum(setupRunStatuses);
export const setupRunOutcomeSchema = z.enum(setupRunOutcomes);
export const setupRunPageStatusSchema = z.enum(setupRunPageStatuses);
export const setupProposalCategorySchema = z.enum(setupProposalCategories);
export const setupProposalDecisionSchema = z.enum(setupProposalDecisions);
export const setupFieldSourceSchema = z.enum(setupFieldSources);

export const setupHoursSchema = z.object({
  weekly: z.array(
    z.object({
      weekday: w3WeekdaySchema,
      opens: w3TimeOfDaySchema,
      closes: w3TimeOfDaySchema,
    }),
  ),
  exceptions: z
    .array(
      z.object({
        date: z.iso.date(),
        closed: z.boolean(),
        opens: w3TimeOfDaySchema.optional(),
        closes: w3TimeOfDaySchema.optional(),
        note: z.string().max(200).optional(),
      }),
    )
    .optional(),
});

export const setupProfileSchema = z.object({
  organizationId: w3IdSchema,
  name: z.string().min(1),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/)
    .optional(),
  email: z.email().optional(),
  websiteUrl: z.url().optional(),
  tagline: z.string().max(160).optional(),
  about: z.string().max(4000).optional(),
  hours: setupHoursSchema,
  socials: z.record(z.string(), z.url()),
  /** Provenance per field; "From your website" stays until confirmed. */
  fieldSources: z.record(
    z.string(),
    z.object({
      source: setupFieldSourceSchema,
      page: z.string().optional(),
      confirmed: z.boolean(),
    }),
  ),
  websiteLastReadAt: w3DateTimeSchema.optional(),
  updatedAt: w3DateTimeSchema,
});

export const setupUpdateProfileInputSchema = setupProfileSchema
  .pick({
    phoneE164: true,
    email: true,
    websiteUrl: true,
    tagline: true,
    about: true,
    hours: true,
    socials: true,
  })
  .partial()
  .extend({
    /** Fields the person confirmed (clears "From your website"). */
    confirmFields: z.array(z.string().max(64)).max(32).optional(),
  });

export const setupRunPageSchema = z.object({
  id: w3IdSchema,
  position: z.number().int().nonnegative(),
  url: z.url(),
  title: z.string().optional(),
  status: setupRunPageStatusSchema,
  itemsFound: z.number().int().nonnegative(),
});

export const setupRunSchema = z.object({
  id: w3IdSchema,
  sourceKind: setupRunSourceKindSchema,
  sourceUrl: z.url().optional(),
  status: setupRunStatusSchema,
  outcome: setupRunOutcomeSchema.optional(),
  failureReason: z.string().max(64).optional(),
  pagesTotal: z.number().int().nonnegative(),
  pagesRead: z.number().int().nonnegative(),
  itemsFound: z.number().int().nonnegative(),
  pages: z.array(setupRunPageSchema),
  startedAt: w3DateTimeSchema.optional(),
  finishedAt: w3DateTimeSchema.optional(),
});

export const setupStartRunInputSchema = z.discriminatedUnion("sourceKind", [
  z.object({ sourceKind: z.literal("website"), sourceUrl: z.url() }),
  z.object({
    sourceKind: z.literal("google-listing"),
    sourceUrl: z.url().optional(),
    query: z.string().min(2).max(200).optional(),
  }),
  z.object({
    sourceKind: z.literal("description"),
    sourceText: z.string().min(10).max(8000),
  }),
]);

export const setupProposalSchema = z.object({
  id: w3IdSchema,
  runId: w3IdSchema,
  category: setupProposalCategorySchema,
  fieldKey: z.string().min(1).max(64),
  label: z.string().min(1),
  /** The proposed value in the target's shape, validated by B1 in code. */
  payload: z.record(z.string(), z.unknown()),
  /** Conflicting values; the person picks one or "Neither". */
  candidates: z.array(z.record(z.string(), z.unknown())),
  sourcePages: z.array(z.string()),
  needsCheck: z.boolean(),
  checkNote: z.string().optional(),
  decision: setupProposalDecisionSchema,
  editedPayload: z.record(z.string(), z.unknown()).optional(),
  decidedAt: w3DateTimeSchema.optional(),
  appliedAt: w3DateTimeSchema.optional(),
  appliedEntity: z
    .object({ type: z.string().min(1), id: w3IdSchema })
    .optional(),
});

export const setupProposalsInputSchema = z.object({ runId: w3IdSchema });
export const setupProposalsSchema = z.object({
  runId: w3IdSchema,
  proposals: z.array(setupProposalSchema),
});

export const setupDecideProposalInputSchema = z.discriminatedUnion("decision", [
  z.object({ proposalId: w3IdSchema, decision: z.literal("kept") }),
  z.object({ proposalId: w3IdSchema, decision: z.literal("skipped") }),
  z.object({
    proposalId: w3IdSchema,
    decision: z.literal("edited"),
    editedPayload: z.record(z.string(), z.unknown()),
  }),
]);

export const setupApplyProposalsInputSchema = z.object({
  runId: w3IdSchema,
  idempotencyKey: z.string().min(8).max(160),
});
export const setupApplyResultSchema = z.object({
  runId: w3IdSchema,
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  proposals: z.array(setupProposalSchema),
});

/** CS-Home: the Club setup readiness list. */
export const setupSectionStateSchema = z.enum([
  "complete",
  "needs-attention",
  "in-progress",
  "not-started",
]);
export const setupReadinessSchema = z.object({
  done: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  /** Bookings open once places, hours, one offering and Duna Pay are ready. */
  bookingsOpen: z.boolean(),
  sections: z.array(
    z.object({
      key: z.enum([
        "identity",
        "contact",
        "places",
        "hours",
        "offerings",
        "team",
        "policies",
        "duna-pay",
        "website",
      ]),
      label: z.string().min(1),
      state: setupSectionStateSchema,
      note: z.string().optional(),
      href: z.string().startsWith("/"),
    }),
  ),
});

export type SetupProfile = z.infer<typeof setupProfileSchema>;
export type SetupRun = z.infer<typeof setupRunSchema>;
export type SetupProposal = z.infer<typeof setupProposalSchema>;
export type SetupReadiness = z.infer<typeof setupReadinessSchema>;
