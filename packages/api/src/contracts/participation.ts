/**
 * Contract: participation (owner: PART-3). Group sessions that fill up:
 * the rule (version 2), the club default, the one display model every
 * surface renders, the at-risk list and the interventions. Procedures
 * `operator.participation.*` and `player.participation.*`; design in
 * docs/plan/participation.md, shapes in docs/plan/schema-requests/PART.md.
 * State lists come from the schema tuples, so CHECK and contract agree.
 */
import {
  PARTICIPATION_COPY_KEYS,
  PARTICIPATION_STATES,
} from "@duna/core";
import {
  participationDefaultKinds,
  participationSubjectTypes,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
} from "./w3-common";

export const participationSubjectTypeSchema = z.enum(participationSubjectTypes);
export const participationStateSchema = z.enum(PARTICIPATION_STATES);
export const participationDisplayStateSchema = z.enum([
  ...PARTICIPATION_STATES,
  "open",
]);
export const participationDefaultKindSchema = z.enum(participationDefaultKinds);

export const participationPriceTierSchema = z.object({
  minParticipants: z.number().int().positive(),
  maxParticipants: z.number().int().positive(),
  creditsPerPlayer: z.number().int().positive().optional(),
  amountMinorPerPlayer: z.number().int().nonnegative().optional(),
});

/** The stored rule, version 2. */
export const participationRuleSchema = z.object({
  version: z.literal(2),
  unit: z.enum(["player", "team"]),
  minParticipants: z.number().int().positive(),
  maxParticipants: z.number().int().positive().optional(),
  minimumPolicy: z.enum(["cancel", "run"]),
  lockMinutesBeforeStart: z.number().int().min(0).max(10_080).optional(),
  waitlist: z.boolean(),
  tiers: z.array(participationPriceTierSchema).readonly(),
  splitCostMinor: z.number().int().positive().optional(),
  effectiveFrom: z.string().optional(),
  legacySettlementBasis: z.literal("attendance").optional(),
});

/**
 * A rule an operator (or Ask Duna) wants to save. Validated in
 * @duna/core so the reasons come back as the plain words of §7.1.
 */
export const participationRuleInputSchema = z.record(z.string(), z.unknown());

export const participationCliffSchema = z.object({
  groupSize: z.number().int().positive(),
  fromTotal: z.number().int().nonnegative(),
  toTotal: z.number().int().nonnegative(),
  unit: z.enum(["credits", "minor"]),
  message: z.string(),
});

export const participationTokenSchema = z.object({
  key: z.enum(PARTICIPATION_COPY_KEYS),
  params: z.record(z.string(), z.union([z.string(), z.number()]).optional()),
});

const participationTimeLabelSchema = z.object({
  at: w3DateTimeSchema,
  label: z.string(),
  labelWithViewer: z.string().optional(),
  timeZone: z.string(),
});

/** The one display model (core `participationDisplay`). */
export const participationDisplaySchema = z.object({
  state: participationDisplayStateSchema,
  hasGroupRule: z.boolean(),
  tone: z.enum(["neutral", "positive", "caution", "critical"]),
  numbers: z.object({
    booked: z.number().int().nonnegative(),
    held: z.number().int().nonnegative(),
    capacity: z.number().int().positive(),
    minimum: z.number().int().positive(),
    needed: z.number().int().nonnegative(),
    spotsLeft: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
    groupSize: z.number().int().nonnegative().optional(),
  }),
  lock: participationTimeLabelSchema.optional(),
  status: participationTokenSchema,
  line: participationTokenSchema.optional(),
  staff: participationTokenSchema,
  price: z
    .object({
      unit: z.literal("credits"),
      reservePerPlayer: z.number().int().nonnegative(),
      nowPerPlayer: z.number().int().nonnegative(),
      maxCharge: z.number().int().nonnegative(),
      finalPerPlayer: z.number().int().nonnegative().optional(),
      ladder: z
        .array(
          z.object({
            minParticipants: z.number().int().positive(),
            maxParticipants: z.number().int().positive(),
            creditsPerPlayer: z.number().int().positive(),
            current: z.boolean(),
            label: participationTokenSchema,
          }),
        )
        .readonly(),
      line: participationTokenSchema.optional(),
      currentRow: participationTokenSchema.optional(),
    })
    .optional(),
  cancellation: z.object({
    allowed: z.boolean(),
    free: z.boolean(),
    freeUntil: participationTimeLabelSchema.optional(),
    lateCharge: z.number().int().nonnegative().optional(),
    line: participationTokenSchema.optional(),
  }),
  a11y: participationTokenSchema,
});

export const participationCopySchema = z.object({
  status: z.string(),
  line: z.string().optional(),
  staff: z.string(),
  price: z.string().optional(),
  ladder: z.array(z.string()).readonly(),
  cancellation: z.string().optional(),
  a11y: z.string(),
});

// ---------------------------------------------------------------------------
// Operator
// ---------------------------------------------------------------------------

export const participationDefaultsSchema = z.object({
  rules: participationRuleSchema.nullable(),
  appliesTo: z.array(participationDefaultKindSchema).readonly(),
  /** Offerings with no rule of their own that inherit the default. */
  inheritedBy: z.number().int().nonnegative(),
  /** Demo only: the default shown is a proposal, not a club's setting. */
  proposed: z.boolean().optional(),
});

export const participationSetDefaultsInputSchema = z.object({
  rules: participationRuleInputSchema,
  appliesTo: z.array(participationDefaultKindSchema).min(1).max(3),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationSetDefaultsResultSchema = z.object({
  rules: participationRuleSchema.nullable(),
  /** Blocking reasons in plain words; nothing was saved when present. */
  issues: z.array(z.string()).readonly(),
  warnings: z.array(participationCliffSchema).readonly(),
});

export const participationPreviewRuleChangeInputSchema = z.object({
  subjectType: z.literal("catalog-session-occurrence").optional(),
  catalogItemId: w3IdSchema,
  rules: participationRuleInputSchema,
});

export const participationPreviewRuleChangeSchema = z.object({
  issues: z.array(z.string()).readonly(),
  warnings: z.array(participationCliffSchema).readonly(),
  changeClass: z.enum(["loosens", "tightens", "neutral"]),
  unbookedSessions: z.number().int().nonnegative(),
  bookedSessions: z
    .array(
      z.object({
        id: w3IdSchema,
        startsAt: w3DateTimeSchema,
        booked: z.number().int().nonnegative(),
      }),
    )
    .readonly(),
});

export const participationApplyRuleToBookedInputSchema = z.object({
  catalogItemId: w3IdSchema,
  occurrenceIds: z.array(w3IdSchema).min(1).max(500),
  confirmed: z.literal(true),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationApplyRuleToBookedSchema = z.object({
  updated: z.number().int().nonnegative(),
  /** Sessions where the change would not loosen things (never applied). */
  skipped: z.array(w3IdSchema).readonly(),
});

export const participationAtRiskInputSchema = z
  .object({
    from: w3DateTimeSchema.optional(),
    to: w3DateTimeSchema.optional(),
  })
  .optional();

export const participationAtRiskSessionSchema = z.object({
  subjectType: participationSubjectTypeSchema,
  subjectId: w3IdSchema,
  catalogItemId: w3IdSchema.optional(),
  title: z.string(),
  startsAt: w3DateTimeSchema,
  timezone: z.string(),
  coachNames: z.array(z.string()).readonly(),
  booked: z.number().int().nonnegative(),
  min: z.number().int().positive(),
  capacity: z.number().int().positive(),
  lockAt: w3DateTimeSchema,
  displayState: participationStateSchema,
  /** Present only with `payments:read`. */
  atStakeMinor: z.number().int().nonnegative().optional(),
  atStakeCredits: z.number().int().nonnegative().optional(),
});

export const participationAtRiskSchema = z.object({
  sessions: z.array(participationAtRiskSessionSchema).readonly(),
  totals: z.object({
    sessions: z.number().int().nonnegative(),
    booked: z.number().int().nonnegative(),
    atStakeMinor: z.number().int().nonnegative().optional(),
    atStakeCredits: z.number().int().nonnegative().optional(),
    currency: z.string().length(3),
  }),
});

const participationSubjectInput = {
  subjectType: participationSubjectTypeSchema,
  subjectId: w3IdSchema,
};

export const participationExtendLockInputSchema = z.object({
  ...participationSubjectInput,
  lockAt: w3DateTimeSchema,
  /** The interaction kit's `confirm` tier answered yes. */
  confirmed: z.literal(true),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationExtendLockSchema = z.object({
  lockAt: w3DateTimeSchema,
  noticesQueued: z.number().int().nonnegative(),
});

export const participationRunAnywayInputSchema = z.object({
  ...participationSubjectInput,
  confirmed: z.literal(true),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationRunAnywaySchema = z.object({
  displayState: participationStateSchema,
});

export const participationClubCancelReasonSchema = z.enum([
  "coach",
  "weather",
  "venue",
  "other",
]);

export const participationCancelSessionInputSchema = z.object({
  ...participationSubjectInput,
  reason: participationClubCancelReasonSchema,
  /**
   * The club's personal message. Never stored or sent from here: the UI
   * sends it to players through Concierge `SendReview`.
   */
  note: z.string().max(500).optional(),
  /** The interaction kit's `strong` tier answered yes (people and refunds restated). */
  confirmed: z.literal(true),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationCancelSessionSchema = z.object({
  cancellations: z
    .array(
      z.object({
        bookingId: w3IdSchema,
        refundStatus: z.enum([
          "credits-restored",
          "refund-submitted",
          "released",
          "review-required",
        ]),
      }),
    )
    .readonly(),
});

export const participationRequestCancelInputSchema = z.object({
  ...participationSubjectInput,
  reason: participationClubCancelReasonSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationRequestCancelSchema = z.object({
  requestId: w3IdSchema,
});

export const participationCancelRequestSchema = z.object({
  id: w3IdSchema,
  subjectType: participationSubjectTypeSchema,
  subjectId: w3IdSchema,
  requestedByPersonId: w3IdSchema,
  reason: participationClubCancelReasonSchema,
  status: z.enum(["open", "approved", "declined", "withdrawn"]),
  createdAt: w3DateTimeSchema,
});

export const participationRecordAttendanceInputSchema = z.object({
  ...participationSubjectInput,
  marks: z
    .array(
      z.object({
        bookingId: w3IdSchema,
        status: z.enum(["attended", "absent"]),
        /** Offline marks keep the phone's time. */
        deviceMarkedAt: w3DateTimeSchema.optional(),
      }),
    )
    .min(1)
    .max(500),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const participationRecordAttendanceSchema = z.object({
  recorded: z.number().int().nonnegative(),
  ignored: z
    .array(z.object({ bookingId: w3IdSchema, reason: z.string() }))
    .readonly(),
});

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export const participationQuoteInputSchema = z.object({
  catalogItemId: w3IdSchema,
  catalogSessionOccurrenceId: w3IdSchema,
  participantPersonId: w3IdSchema.optional(),
  quantity: z.number().int().min(1).max(50).default(1),
  paymentMethod: z.enum(["credit", "card", "cash"]).default("credit"),
  /** The viewer's device zone, to add "(9:00 PM your time)". */
  viewerTimeZone: z.string().max(64).optional(),
});

export const participationQuoteSchema = z.object({
  subjectType: z.literal("catalog-session-occurrence"),
  subjectId: w3IdSchema,
  title: z.string(),
  startsAt: w3DateTimeSchema,
  timezone: z.string(),
  hasGroupRule: z.boolean(),
  displayState: participationDisplayStateSchema,
  display: participationDisplaySchema,
  copy: participationCopySchema,
  /** Credits each player reserves now: the most they can be charged per place. */
  reserve: z.number().int().nonnegative().optional(),
  maxCharge: z.number().int().nonnegative().optional(),
  /** Decision 5: show "You're already booked" with "Add a player". */
  alreadyBooked: z.boolean(),
  lockAt: w3DateTimeSchema.optional(),
});

export type ParticipationQuoteOutput = z.infer<typeof participationQuoteSchema>;
