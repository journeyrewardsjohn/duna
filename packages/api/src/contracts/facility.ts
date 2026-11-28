/**
 * Contract: facility (owner: B9). Facility owners (public courts): listing,
 * policies, access rules, access requests with expiry, stop-play, and the
 * public listing with hourly slots. Frozen by W3-0; H14 and the player
 * booking boards build against `@duna/core/demo/facility`. Procedures:
 * `operator.facility.*`, `player.facility.*`, `public.facility.*` (see
 * docs/plan/w3-contracts.md). Kill switch: `facility.owners`.
 */
import {
  courtPlayStopReasons,
  courtPlayStopSources,
  courtPlayStopStatuses,
  facilityAccessModes,
  facilityAccessRequestStatuses,
  facilityLightingSummaries,
  facilityLightningActions,
  facilityListingStatuses,
  facilityPayoutModes,
  facilityRuleStatuses,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3PersonRefSchema,
  w3TimeOfDaySchema,
  w3WeekdaySchema,
} from "./w3-common";

export const facilityListingStatusSchema = z.enum(facilityListingStatuses);
export const facilityAccessModeSchema = z.enum(facilityAccessModes);
export const facilityPayoutModeSchema = z.enum(facilityPayoutModes);
export const facilityLightingSchema = z.enum(facilityLightingSummaries);
export const facilityLightningActionSchema = z.enum(facilityLightningActions);
export const facilityRuleStatusSchema = z.enum(facilityRuleStatuses);
export const facilityAccessRequestStatusSchema = z.enum(
  facilityAccessRequestStatuses,
);
export const facilityPlayStopReasonSchema = z.enum(courtPlayStopReasons);
export const facilityPlayStopSourceSchema = z.enum(courtPlayStopSources);
export const facilityPlayStopStatusSchema = z.enum(courtPlayStopStatuses);

export const facilityPoliciesSchema = z.object({
  freeCancelMinutes: z.number().int().nonnegative().optional(),
  noShowPolicy: z.string().max(1000).optional(),
  maxHoursPerPersonPerDay: z.number().int().positive().optional(),
  maxHoursPerPersonPerWeek: z.number().int().positive().optional(),
  bookingWindowDays: z.number().int().min(0).max(365),
  maxPlayersPerCourt: z.number().int().positive().optional(),
  lightsOffAt: w3TimeOfDaySchema.optional(),
  noiseEndsAt: w3TimeOfDaySchema.optional(),
  lightningRadiusKm: z.number().positive().optional(),
  lightningAction: facilityLightningActionSchema.optional(),
});

export const facilityCourtSchema = z.object({
  courtId: w3IdSchema,
  name: z.string().min(1),
  lit: z.boolean(),
  /** "Lit until 10:00 PM" on the public listing. */
  litUntil: w3TimeOfDaySchema.optional(),
});

export const facilityListingSchema = z.object({
  id: w3IdSchema,
  organizationId: w3IdSchema,
  venueId: w3IdSchema,
  venueName: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: facilityListingStatusSchema,
  defaultAccess: facilityAccessModeSchema,
  lighting: facilityLightingSchema,
  payoutMode: facilityPayoutModeSchema,
  pricePerCourtHour: w3AmountSchema,
  waiver: z
    .object({ waiverDocumentId: w3IdSchema, title: z.string().min(1) })
    .optional(),
  policies: facilityPoliciesSchema,
  autoApproveSignedAdults: z.boolean(),
  courts: z.array(facilityCourtSchema),
  publishedAt: w3DateTimeSchema.optional(),
  updatedAt: w3DateTimeSchema,
});

export const facilitySaveListingInputSchema = z.object({
  listingId: w3IdSchema.optional(),
  venueId: w3IdSchema,
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(96),
  defaultAccess: facilityAccessModeSchema,
  lighting: facilityLightingSchema,
  litCourtIds: z.array(w3IdSchema).max(64).optional(),
  payoutMode: facilityPayoutModeSchema,
  pricePerCourtHour: w3AmountSchema,
  waiverDocumentId: w3IdSchema.optional(),
  policies: facilityPoliciesSchema,
  autoApproveSignedAdults: z.boolean(),
});

/** Publishing, pausing and archiving are separate, confirmed actions. */
export const facilitySetListingStatusInputSchema = z.object({
  listingId: w3IdSchema,
  status: facilityListingStatusSchema.exclude(["draft"]),
});

export const facilityAccessRuleSchema = z.object({
  id: w3IdSchema,
  listingId: w3IdSchema,
  access: facilityAccessModeSchema,
  /** Empty = every court at the venue. */
  courtIds: z.array(w3IdSchema),
  weekdays: z.array(w3WeekdaySchema).min(1),
  startsAt: w3TimeOfDaySchema.optional(),
  endsAt: w3TimeOfDaySchema.optional(),
  seasonStartsOn: w3DateSchema.optional(),
  seasonEndsOn: w3DateSchema.optional(),
  earlyAccessHours: z.number().int().min(1).max(720).optional(),
  priority: z.number().int(),
  status: facilityRuleStatusSchema,
  /** Plain sentence for the rule list ("Weekdays after 4 PM: approved players only"). */
  summary: z.string().min(1),
});

export const facilitySaveAccessRuleInputSchema = facilityAccessRuleSchema
  .omit({ id: true, summary: true })
  .extend({ ruleId: w3IdSchema.optional() });

export const facilityListingRefInputSchema = z.object({
  listingId: w3IdSchema,
});

export const facilityAccessRequestSchema = z.object({
  id: w3IdSchema,
  listingId: w3IdSchema,
  person: w3PersonRefSchema,
  guardian: w3PersonRefSchema.optional(),
  status: facilityAccessRequestStatusSchema,
  affiliation: z.string().optional(),
  message: z.string().optional(),
  /** "Played here 6 times". */
  playCount: z.number().int().nonnegative(),
  rating: z.number().optional(),
  waiverSignedAt: w3DateTimeSchema.optional(),
  autoApproved: z.boolean(),
  requestedAt: w3DateTimeSchema,
  decidedAt: w3DateTimeSchema.optional(),
  decisionNote: z.string().optional(),
  /** Absent = no expiry. */
  expiresAt: w3DateTimeSchema.optional(),
});

export const facilityAccessRequestsInputSchema = z.object({
  listingId: w3IdSchema,
  status: facilityAccessRequestStatusSchema.optional(),
});

export const facilityDecideAccessRequestInputSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({ requestId: w3IdSchema, decision: z.literal("approve") }),
    z.object({
      requestId: w3IdSchema,
      decision: z.literal("approve-for-days"),
      days: z.number().int().min(1).max(366),
    }),
    z.object({
      requestId: w3IdSchema,
      decision: z.literal("approve-until"),
      until: w3DateSchema,
    }),
    z.object({
      requestId: w3IdSchema,
      decision: z.literal("decline"),
      note: z.string().max(500).optional(),
    }),
    z.object({ requestId: w3IdSchema, decision: z.literal("remove") }),
  ],
);

export const facilityPlayStopSchema = z.object({
  id: w3IdSchema,
  venueId: w3IdSchema,
  /** Empty = every court ("Close all courts"). */
  courtIds: z.array(w3IdSchema),
  reason: facilityPlayStopReasonSchema,
  source: facilityPlayStopSourceSchema,
  status: facilityPlayStopStatusSchema,
  note: z.string().optional(),
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema.optional(),
  liftedAt: w3DateTimeSchema.optional(),
  startedBy: w3PersonRefSchema.optional(),
  affectedReservations: z.number().int().nonnegative(),
});

export const facilityPlayStopsInputSchema = z.object({
  venueId: w3IdSchema.optional(),
  status: facilityPlayStopStatusSchema.optional(),
});

export const facilityStartPlayStopInputSchema = z.object({
  venueId: w3IdSchema,
  courtIds: z.array(w3IdSchema).max(64),
  reason: facilityPlayStopReasonSchema,
  note: z.string().max(500).optional(),
  endsAt: w3DateTimeSchema.optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const facilityLiftPlayStopInputSchema = z.object({
  playStopId: w3IdSchema,
});

/** Player: ask for access to approved-only courts (for themself or a managed minor). */
export const facilityRequestAccessInputSchema = z.object({
  listingId: w3IdSchema,
  forPersonId: w3IdSchema.optional(),
  affiliation: z.string().max(200).optional(),
  message: z.string().max(500).optional(),
});

/** Public listing (F-Listing, B-Web-Facility). Never shows other players. */
export const facilitySlotStateSchema = z.enum([
  "available",
  "taken",
  "ask",
  "stopped",
  "closed",
]);
export const facilityPublicListingSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  locality: z.string().optional(),
  timezone: z.string().min(1),
  lighting: facilityLightingSchema,
  /** "Open to everyone until 4 PM, then approved players only". */
  accessBanner: z.string().min(1),
  pricePerCourtHour: w3AmountSchema,
  waiverRequired: z.boolean(),
  policies: facilityPoliciesSchema,
  courts: z.array(facilityCourtSchema),
  activePlayStop: facilityPlayStopSchema
    .pick({ reason: true, startsAt: true, endsAt: true, note: true })
    .optional(),
});
export const facilitySlotsInputSchema = z.object({
  slug: z.string().min(1).max(96),
  date: w3DateSchema,
});
export const facilitySlotsSchema = z.object({
  slug: z.string().min(1),
  date: w3DateSchema,
  slots: z.array(
    z.object({
      courtId: w3IdSchema,
      startsAt: w3DateTimeSchema,
      endsAt: w3DateTimeSchema,
      state: facilitySlotStateSchema,
      price: w3AmountSchema.optional(),
      access: facilityAccessModeSchema,
    }),
  ),
});

export type FacilityListing = z.infer<typeof facilityListingSchema>;
export type FacilityAccessRule = z.infer<typeof facilityAccessRuleSchema>;
export type FacilityAccessRequest = z.infer<typeof facilityAccessRequestSchema>;
export type FacilityPlayStop = z.infer<typeof facilityPlayStopSchema>;
export type FacilityPublicListing = z.infer<typeof facilityPublicListingSchema>;
