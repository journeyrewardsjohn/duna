/**
 * Contract: training-drills (owners: B5 library and storefront, B6a scene
 * model). Frozen by W3-0: B5/B6a implement the service behind these shapes;
 * H8 builds the library, detail, sharing and store against them and the
 * demo fixtures in `@duna/core/demo/training-drills`. Procedures:
 * `operator.trainingDrills.*`, `player.trainingDrills.*`,
 * `public.trainingDrills.*` (see docs/plan/w3-contracts.md).
 *
 * The scene document is opaque here (model v2, metres from the net centre);
 * `packages/training-scene` owns its schema and the 17-rule validator.
 */
import {
  trainingContentStatusEnum,
  trainingDrillListingPricings,
  trainingDrillListingStatuses,
  trainingDrillPurchaseStatuses,
  trainingDrillReviewCheckKinds,
  trainingDrillReviewCheckStatuses,
  trainingDrillReviewStates,
  trainingDrillScopes,
  trainingSceneSources,
  trainingSceneValidationStatuses,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3BasisPointsSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3LoadSchema,
  w3PersonRefSchema,
} from "./w3-common";

export const trainingDrillsScopeSchema = z.enum(trainingDrillScopes);
/** Library tabs: the three owned scopes plus "Purchased". */
export const trainingDrillsLibraryScopes = [
  ...trainingDrillScopes,
  "purchased",
] as const;
export const trainingDrillsLibraryScopeSchema = z.enum(
  trainingDrillsLibraryScopes,
);
export const trainingDrillsStatusSchema = z.enum(
  trainingContentStatusEnum.enumValues,
);
export const trainingDrillsReviewStateSchema = z.enum(
  trainingDrillReviewStates,
);
export const trainingDrillsReviewCheckKindSchema = z.enum(
  trainingDrillReviewCheckKinds,
);
export const trainingDrillsReviewCheckStatusSchema = z.enum(
  trainingDrillReviewCheckStatuses,
);
export const trainingDrillsListingStatusSchema = z.enum(
  trainingDrillListingStatuses,
);
export const trainingDrillsListingPricingSchema = z.enum(
  trainingDrillListingPricings,
);
export const trainingDrillsPurchaseStatusSchema = z.enum(
  trainingDrillPurchaseStatuses,
);
export const trainingDrillsSceneValidationSchema = z.enum(
  trainingSceneValidationStatuses,
);
export const trainingDrillsSceneSourceSchema = z.enum(trainingSceneSources);

export const trainingDrillsPlayersSchema = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  recommended: z.number().int().positive(),
});

export const trainingDrillsSummarySchema = z.object({
  id: w3IdSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  scope: trainingDrillsScopeSchema,
  /** True when the caller's organisation holds it through a purchase. */
  purchased: z.boolean(),
  status: trainingDrillsStatusSchema,
  reviewState: trainingDrillsReviewStateSchema,
  focus: z.string().min(1),
  players: trainingDrillsPlayersSchema,
  durationMinutes: z.number().int().min(1).max(480),
  level: z.string().min(1),
  equipment: z.array(z.string()),
  load: w3LoadSchema,
  touches: z.number().int().nonnegative(),
  jumps: z.number().int().nonnegative(),
  author: w3PersonRefSchema.optional(),
  /** Club or creator shown for purchased and Duna drills. */
  sourceLabel: z.string().optional(),
  version: z.number().int().positive(),
  usedInPlans: z.number().int().nonnegative(),
  updatedAt: w3DateTimeSchema,
});

export const trainingDrillsVersionSchema = z.object({
  id: w3IdSchema,
  version: z.number().int().positive(),
  changeNote: z.string().optional(),
  createdBy: w3PersonRefSchema.optional(),
  createdAt: w3DateTimeSchema,
});

export const trainingDrillsSceneIssueSchema = z.object({
  rule: z.string().min(1),
  message: z.string().min(1),
});

export const trainingDrillsSceneSchema = z.object({
  id: w3IdSchema,
  drillVersionId: w3IdSchema,
  modelVersion: z.number().int().min(2),
  /** Scene model v2 document; validated by packages/training-scene. */
  document: z.record(z.string(), z.unknown()),
  derived: z.object({
    touchesPerRep: z.number().nonnegative().optional(),
    jumpsPerRep: z.number().nonnegative().optional(),
    metresPerPlayer: z.number().nonnegative().optional(),
    workRestRatio: z.string().optional(),
  }),
  validationStatus: trainingDrillsSceneValidationSchema,
  validationIssues: z.array(trainingDrillsSceneIssueSchema),
  validatorVersion: z.string().optional(),
  validatedAt: w3DateTimeSchema.optional(),
  source: trainingDrillsSceneSourceSchema,
  hasPinnedEdits: z.boolean(),
});

export const trainingDrillsReviewCheckSchema = z.object({
  kind: trainingDrillsReviewCheckKindSchema,
  status: trainingDrillsReviewCheckStatusSchema,
  note: z.string().optional(),
  decidedAt: w3DateTimeSchema.optional(),
});

export const trainingDrillsSellerSchema = z.object({
  kind: z.enum(["organization", "person"]),
  id: w3IdSchema,
  displayName: z.string().min(1),
});

export const trainingDrillsListingSchema = z.object({
  id: w3IdSchema,
  drillId: w3IdSchema,
  drillVersionId: w3IdSchema,
  status: trainingDrillsListingStatusSchema,
  pricing: trainingDrillsListingPricingSchema,
  price: w3AmountSchema,
  licenseTerms: z.string().min(1),
  listedAs: z.string().min(1),
  seller: trainingDrillsSellerSchema,
  /** Duna's marketplace fee on paid listings, shown before listing. */
  marketplaceFeeBps: w3BasisPointsSchema,
  listedAt: w3DateTimeSchema.optional(),
  delistedAt: w3DateTimeSchema.optional(),
});

export const trainingDrillsDetailSchema = trainingDrillsSummarySchema.extend({
  summary: z.string(),
  purpose: z.string(),
  targetAudience: z.string(),
  descriptionMarkdown: z.string(),
  coachingCues: z.array(z.string()),
  rotationRule: z.string().optional(),
  successCriteria: z.string().optional(),
  currentVersionId: w3IdSchema,
  versions: z.array(trainingDrillsVersionSchema),
  scene: trainingDrillsSceneSchema.optional(),
  reviewChecks: z.array(trainingDrillsReviewCheckSchema),
  listing: trainingDrillsListingSchema.optional(),
});

export const trainingDrillsFiltersSchema = z.object({
  query: z.string().max(200).optional(),
  focus: z.string().max(80).optional(),
  players: z.number().int().positive().optional(),
  level: z.string().max(80).optional(),
  equipment: z.array(z.string().max(80)).max(10).optional(),
  maxMinutes: z.number().int().positive().optional(),
});

export const trainingDrillsLibraryInputSchema = trainingDrillsFiltersSchema
  .extend({ scope: trainingDrillsLibraryScopeSchema })
  .strict();
export const trainingDrillsLibrarySchema = z.object({
  scope: trainingDrillsLibraryScopeSchema,
  items: z.array(trainingDrillsSummarySchema),
});
export const trainingDrillsDrillInputSchema = z.object({ drillId: w3IdSchema });

/** Saving always makes a new immutable version (and scene, if given). */
export const trainingDrillsSaveVersionInputSchema = z.object({
  drillId: w3IdSchema.optional(),
  title: z.string().min(1).max(160),
  scope: z.enum(["personal", "club"]),
  focus: z.string().min(1).max(80),
  summary: z.string().max(500),
  purpose: z.string().max(2000),
  targetAudience: z.string().max(500),
  descriptionMarkdown: z.string().max(20_000),
  players: trainingDrillsPlayersSchema,
  durationMinutes: z.number().int().min(1).max(480),
  level: z.string().min(1).max(80),
  equipment: z.array(z.string().max(80)).max(20),
  coachingCues: z.array(z.string().max(300)).max(20),
  rotationRule: z.string().max(500).optional(),
  successCriteria: z.string().max(500).optional(),
  scene: z.record(z.string(), z.unknown()).optional(),
  changeNote: z.string().max(500).optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});
/** "Private → Our club" (DL-Share). Listing on Duna is a listing, not a scope. */
export const trainingDrillsSetScopeInputSchema = z.object({
  drillId: w3IdSchema,
  scope: z.enum(["personal", "club"]),
});
export const trainingDrillsSubmitForReviewInputSchema = z.object({
  drillId: w3IdSchema,
  drillVersionId: w3IdSchema,
});
export const trainingDrillsSaveListingInputSchema = z
  .object({
    drillId: w3IdSchema,
    drillVersionId: w3IdSchema,
    pricing: trainingDrillsListingPricingSchema,
    price: w3AmountSchema,
    licenseTerms: z.string().min(1).max(4000),
    listedAs: z.string().min(1).max(160),
    sellAs: z.enum(["organization", "person"]),
  })
  .refine(
    (input) =>
      (input.pricing === "free" && input.price.amountMinor === 0) ||
      (input.pricing === "paid" && input.price.amountMinor > 0),
    { message: "Free listings cost nothing; paid listings need a price." },
  );
export const trainingDrillsListingInputSchema = z.object({
  listingId: w3IdSchema,
});

export const trainingDrillsStoreItemSchema = z.object({
  listing: trainingDrillsListingSchema,
  drill: trainingDrillsSummarySchema,
});
export const trainingDrillsStoreInputSchema = trainingDrillsFiltersSchema;
export const trainingDrillsStoreSchema = z.object({
  /** The `training.storefront` kill switch; false hides the store honestly. */
  enabled: z.boolean(),
  items: z.array(trainingDrillsStoreItemSchema),
});

export const trainingDrillsPurchaseSchema = z.object({
  id: w3IdSchema,
  listingId: w3IdSchema,
  drillId: w3IdSchema,
  status: trainingDrillsPurchaseStatusSchema,
  price: w3AmountSchema,
  buyer: z.object({
    kind: z.enum(["organization", "person"]),
    id: w3IdSchema,
  }),
  /** A paid purchase is pending until the person completes checkout. */
  checkoutRequired: z.boolean(),
  orderId: w3IdSchema.optional(),
  licenseId: w3IdSchema.optional(),
  completedAt: w3DateTimeSchema.optional(),
});
export const trainingDrillsPurchaseInputSchema = z.object({
  listingId: w3IdSchema,
  buyAs: z.enum(["organization", "person"]),
  idempotencyKey: w3IdempotencyKeySchema,
});
export const trainingDrillsPurchasesSchema = z.object({
  items: z.array(trainingDrillsPurchaseSchema),
});

export type TrainingDrillsSummary = z.infer<typeof trainingDrillsSummarySchema>;
export type TrainingDrillsDetail = z.infer<typeof trainingDrillsDetailSchema>;
export type TrainingDrillsListing = z.infer<typeof trainingDrillsListingSchema>;
export type TrainingDrillsPurchase = z.infer<
  typeof trainingDrillsPurchaseSchema
>;
export type TrainingDrillsScene = z.infer<typeof trainingDrillsSceneSchema>;
