/**
 * Contract: training-programs (owner: B4). Training programs unified, their
 * sessions (`training_events`) and practice plans. Frozen by W3-0: B4
 * implements the service behind these shapes; H6 (programs) and H7
 * (practice plan builder) build against them and the demo fixtures in
 * `@duna/core/demo/training-programs`. Procedures:
 * `operator.trainingPrograms.*` and `player.trainingPrograms.*` (see
 * docs/plan/w3-contracts.md).
 */
import {
  trainingContentStatusEnum,
  trainingEstimateSources,
  trainingEventCoachRoles,
  trainingEventKindEnum,
  trainingEventStatusEnum,
  trainingProgramCoachRoles,
  trainingProgramExceptionKinds,
  trainingProgramStatusEnum,
  trainingProgramWeekPhases,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3LoadSchema,
  w3PersonRefSchema,
  w3TimeOfDaySchema,
  w3WeekdaySchema,
} from "./w3-common";

/**
 * Program states. The database enum has no "cancelled" yet (see
 * FOLLOW-UP-DROPS.md): a cancelled program is stored as `archived` with
 * `cancelled_at` set, and the service reports it as "cancelled".
 */
export const trainingProgramsProgramStatuses = [
  ...trainingProgramStatusEnum.enumValues,
  "cancelled",
] as const;
export const trainingProgramsProgramStatusSchema = z.enum(
  trainingProgramsProgramStatuses,
);
export const trainingProgramsSessionStatusSchema = z.enum(
  trainingEventStatusEnum.enumValues,
);
export const trainingProgramsSessionKindSchema = z.enum(
  trainingEventKindEnum.enumValues,
);
export const trainingProgramsCoachRoleSchema = z.enum(
  trainingProgramCoachRoles,
);
export const trainingProgramsSessionCoachRoleSchema = z.enum(
  trainingEventCoachRoles,
);
export const trainingProgramsExceptionKindSchema = z.enum(
  trainingProgramExceptionKinds,
);
export const trainingProgramsWeekPhaseSchema = z.enum(
  trainingProgramWeekPhases,
);
export const trainingProgramsEstimateSourceSchema = z.enum(
  trainingEstimateSources,
);
export const trainingProgramsPlanStatusSchema = z.enum(
  trainingContentStatusEnum.enumValues,
);
/** Where a session came from (`training_events.source`). */
export const trainingProgramsSessionSources = [
  "program",
  "manual",
  "catalog",
  "imported",
  "ai-draft",
] as const;
export const trainingProgramsSessionSourceSchema = z.enum(
  trainingProgramsSessionSources,
);

// ---------------------------------------------------------------- programs

export const trainingProgramsCoachSchema = w3PersonRefSchema.extend({
  role: trainingProgramsCoachRoleSchema,
  /** Weekdays covered; empty = every practice ("Lead · all practices"). */
  weekdays: z.array(w3WeekdaySchema),
});

export const trainingProgramsWeeklySlotSchema = z.object({
  id: w3IdSchema,
  weekday: w3WeekdaySchema,
  startsAt: w3TimeOfDaySchema,
  endsAt: w3TimeOfDaySchema,
  /** Every N weeks (1 = weekly). */
  intervalWeeks: z.number().int().min(1).max(8),
  venueId: w3IdSchema.optional(),
  courtIds: z.array(w3IdSchema),
  /** Derived from sunset and lit courts ("Under lights after 4:45 PM"). */
  lightingNote: z.string().optional(),
});

export const trainingProgramsExceptionSchema = z.object({
  id: w3IdSchema,
  kind: trainingProgramsExceptionKindSchema,
  startsOn: w3DateSchema,
  endsOn: w3DateSchema,
  label: z.string().min(1),
  sessionId: w3IdSchema.optional(),
  sourceUrl: z.url().optional(),
});

export const trainingProgramsWeekSchema = z.object({
  weekNumber: z.number().int().positive(),
  startsOn: w3DateSchema,
  phase: trainingProgramsWeekPhaseSchema,
  plannedLoad: w3LoadSchema,
  note: z.string().optional(),
});

export const trainingProgramsCountsSchema = z.object({
  athletes: z.number().int().nonnegative(),
  weeks: z.number().int().nonnegative(),
  weeksOff: z.number().int().nonnegative(),
  practices: z.number().int().nonnegative(),
  milestones: z.number().int().nonnegative(),
  plansAttached: z.number().int().nonnegative(),
});

export const trainingProgramsCancellationSchema = z.object({
  cancelledAt: w3DateTimeSchema,
  reason: z.string().min(1),
  cancelledBy: w3PersonRefSchema.optional(),
});

export const trainingProgramsProgramSummarySchema = z.object({
  id: w3IdSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  status: trainingProgramsProgramStatusSchema,
  startDate: w3DateSchema,
  endDate: w3DateSchema,
  /** "Week 1 of 12" while active. */
  currentWeek: z.number().int().positive().optional(),
  counts: trainingProgramsCountsSchema,
  leadCoach: w3PersonRefSchema.optional(),
});

export const trainingProgramsProgramSchema =
  trainingProgramsProgramSummarySchema.extend({
    purpose: z.string(),
    targetAudience: z.string(),
    objectives: z.array(z.string()),
    timezone: z.string().min(1),
    defaultPracticeMinutes: z.number().int().min(1).max(720),
    /** The linked sellable offering ("Sell as an offering"). */
    catalogItemId: w3IdSchema.optional(),
    sourceText: z.string().optional(),
    coaches: z.array(trainingProgramsCoachSchema),
    weeklySlots: z.array(trainingProgramsWeeklySlotSchema),
    exceptions: z.array(trainingProgramsExceptionSchema),
    weeks: z.array(trainingProgramsWeekSchema),
    cancellation: trainingProgramsCancellationSchema.optional(),
    updatedAt: w3DateTimeSchema,
  });

export const trainingProgramsListInputSchema = z.object({
  status: trainingProgramsProgramStatusSchema.optional(),
});
export const trainingProgramsListSchema = z.object({
  items: z.array(trainingProgramsProgramSummarySchema),
});
export const trainingProgramsProgramInputSchema = z.object({
  programId: w3IdSchema,
});

const slotInputSchema = trainingProgramsWeeklySlotSchema
  .omit({ id: true, lightingNote: true })
  .refine((slot) => slot.endsAt > slot.startsAt, {
    message: "A practice ends after it starts.",
  });
const exceptionInputSchema = trainingProgramsExceptionSchema.omit({ id: true });

export const trainingProgramsDraftSchema = z.object({
  title: z.string().min(1).max(160),
  purpose: z.string().max(2000).default(""),
  targetAudience: z.string().max(500).default(""),
  objectives: z.array(z.string().max(200)).max(20).default([]),
  startDate: w3DateSchema,
  endDate: w3DateSchema,
  timezone: z.string().min(1),
  defaultPracticeMinutes: z.number().int().min(1).max(720).default(90),
  coaches: z
    .array(
      z.object({
        personId: w3IdSchema,
        role: trainingProgramsCoachRoleSchema,
        weekdays: z.array(w3WeekdaySchema).default([]),
      }),
    )
    .max(12),
  weeklySlots: z.array(slotInputSchema).max(14),
  exceptions: z.array(exceptionInputSchema).max(60),
  athletePersonIds: z.array(w3IdSchema).max(200).default([]),
});

/** "Create from a sentence": a proposal a person reviews; nothing is saved. */
export const trainingProgramsProposeInputSchema = z.object({
  sentence: z.string().min(10).max(4000),
});
export const trainingProgramsProposalSchema = z.object({
  sourceText: z.string(),
  draft: trainingProgramsDraftSchema,
  /** What Duna assumed and the person should check. */
  assumptions: z.array(z.string()),
  needsCheck: z.array(z.object({ field: z.string(), note: z.string() })),
});

export const trainingProgramsCreateInputSchema =
  trainingProgramsDraftSchema.extend({
    sourceText: z.string().max(4000).optional(),
    idempotencyKey: w3IdempotencyKeySchema,
  });
export const trainingProgramsUpdateInputSchema = trainingProgramsDraftSchema
  .partial()
  .extend({
    programId: w3IdSchema,
    weeks: z.array(trainingProgramsWeekSchema).max(104).optional(),
  });
export const trainingProgramsCancelInputSchema = z.object({
  programId: w3IdSchema,
  reason: z.string().min(1).max(500),
  /** Sends the cancellation through Concierge after a person confirms there. */
  notifyAthletes: z.boolean(),
});

// ---------------------------------------------------------------- sessions

export const trainingProgramsSessionPlanSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("plan"),
    practicePlanId: w3IdSchema,
    practicePlanVersionId: w3IdSchema,
    title: z.string().min(1),
    plannedLoad: w3LoadSchema,
  }),
  z.object({
    mode: z.literal("focus"),
    focus: z.string().min(1).max(200),
    plannedLoad: w3LoadSchema,
    estimatedTouches: z.number().int().nonnegative().optional(),
    estimatedJumps: z.number().int().nonnegative().optional(),
    loadEstimateSource: trainingProgramsEstimateSourceSchema,
  }),
  z.object({ mode: z.literal("none") }),
]);

export const trainingProgramsSessionCoachSchema = w3PersonRefSchema.extend({
  role: trainingProgramsSessionCoachRoleSchema,
  courtId: w3IdSchema.optional(),
});

export const trainingProgramsSessionSchema = z.object({
  id: w3IdSchema,
  programId: w3IdSchema.optional(),
  kind: trainingProgramsSessionKindSchema,
  title: z.string().min(1),
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  timezone: z.string().min(1),
  status: trainingProgramsSessionStatusSchema,
  source: trainingProgramsSessionSourceSchema,
  venueId: w3IdSchema.optional(),
  courtId: w3IdSchema.optional(),
  coaches: z.array(trainingProgramsSessionCoachSchema),
  plan: trainingProgramsSessionPlanSchema,
  /** An open coverage request exists (team-availability). */
  needsCover: z.boolean(),
  athleteCount: z.number().int().nonnegative(),
  cancellation: trainingProgramsCancellationSchema.optional(),
});

export const trainingProgramsSessionsInputSchema = z.object({
  programId: w3IdSchema.optional(),
  from: w3DateTimeSchema,
  to: w3DateTimeSchema,
});
export const trainingProgramsSessionsSchema = z.object({
  items: z.array(trainingProgramsSessionSchema),
});
export const trainingProgramsAddSessionInputSchema = z.object({
  programId: w3IdSchema.optional(),
  kind: trainingProgramsSessionKindSchema,
  title: z.string().min(1).max(160),
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  timezone: z.string().min(1),
  venueId: w3IdSchema.optional(),
  courtId: w3IdSchema.optional(),
  coachPersonIds: z.array(w3IdSchema).max(8).default([]),
  idempotencyKey: w3IdempotencyKeySchema,
});
export const trainingProgramsCancelSessionInputSchema = z.object({
  sessionId: w3IdSchema,
  reason: z.string().min(1).max(500),
  notifyAthletes: z.boolean(),
});
export const trainingProgramsAssignCoachesInputSchema = z.object({
  sessionId: w3IdSchema,
  coaches: z
    .array(
      z.object({
        personId: w3IdSchema,
        role: trainingProgramsSessionCoachRoleSchema,
        courtId: w3IdSchema.optional(),
      }),
    )
    .max(8),
});
export const trainingProgramsSetSessionPlanInputSchema = z.object({
  sessionId: w3IdSchema,
  plan: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("plan"), practicePlanVersionId: w3IdSchema }),
    z.object({
      mode: z.literal("focus"),
      focus: z.string().min(1).max(200),
      plannedLoad: w3LoadSchema,
      estimatedTouches: z.number().int().nonnegative().optional(),
      estimatedJumps: z.number().int().nonnegative().optional(),
    }),
    z.object({ mode: z.literal("none") }),
  ]),
});

// --------------------------------------------------------------- conflicts

export const trainingProgramsConflictKinds = [
  "milestone-overlaps-practice",
  "coach-blackout",
  "coach-time-off",
  "court-unavailable",
] as const;
export const trainingProgramsConflictResolutions = [
  "drop-practice",
  "keep-both",
  "ask-cover",
  "move-practice",
] as const;
export const trainingProgramsConflictStatuses = ["open", "resolved"] as const;

/** Computed by B4 from program dates, exceptions, blackouts and courts; not stored. */
export const trainingProgramsConflictSchema = z.object({
  id: z.string().min(1),
  programId: w3IdSchema,
  sessionId: w3IdSchema,
  kind: z.enum(trainingProgramsConflictKinds),
  description: z.string().min(1),
  suggestedResolutions: z.array(z.enum(trainingProgramsConflictResolutions)),
  status: z.enum(trainingProgramsConflictStatuses),
  resolution: z.enum(trainingProgramsConflictResolutions).optional(),
});
export const trainingProgramsConflictsSchema = z.object({
  items: z.array(trainingProgramsConflictSchema),
});
export const trainingProgramsResolveConflictInputSchema = z.object({
  programId: w3IdSchema,
  conflictId: z.string().min(1),
  resolution: z.enum(trainingProgramsConflictResolutions),
  /** For ask-cover: the substitute to ask. */
  substitutePersonId: w3IdSchema.optional(),
});

// ---------------------------------------------------------- after practice

export const trainingProgramsOutcomeSchema = z.object({
  sessionId: w3IdSchema,
  plannedLoad: w3LoadSchema,
  /** Coach RPE, 1–10. */
  coachRpe: z.number().int().min(1).max(10).optional(),
  actualLoad: w3LoadSchema.optional(),
  attendance: z.array(
    w3PersonRefSchema.extend({
      present: z.boolean(),
      /** Proposed by Duna from check-ins until a coach confirms. */
      proposed: z.boolean(),
    }),
  ),
  blocks: z.array(
    z.object({
      blockId: w3IdSchema,
      title: z.string(),
      plannedMinutes: z.number().int().positive(),
      actualMinutes: z.number().int().nonnegative().optional(),
      outcome: z.string().max(500).optional(),
    }),
  ),
  notes: z.string().max(4000).optional(),
  recordedAt: w3DateTimeSchema.optional(),
});
export const trainingProgramsRecordOutcomeInputSchema =
  trainingProgramsOutcomeSchema.omit({ plannedLoad: true, recordedAt: true });

// ---------------------------------------------------------- practice plans

/** Block types on PP-Builder (`training_practice_plan_blocks.kind`). */
export const trainingProgramsBlockKinds = [
  "drill",
  "warmup",
  "meeting",
  "cool-down",
  "free-play",
  "custom",
] as const;

export const trainingProgramsPlanAssumptionsSchema = z.object({
  athletes: z.number().int().positive(),
  courts: z.number().int().positive(),
  ballsPerCourt: z.number().int().nonnegative(),
  level: z.string().min(1),
  seasonWeek: z.number().int().positive().optional(),
  targetLoad: w3LoadSchema.optional(),
});

export const trainingProgramsBlockSchema = z.object({
  id: w3IdSchema,
  sequence: z.number().int().nonnegative(),
  /** A lane per court ("Court 1") or "all". */
  lane: z.string().min(1).max(48),
  title: z.string().min(1),
  kind: z.enum(trainingProgramsBlockKinds),
  startsAtMinute: z.number().int().nonnegative(),
  durationMinutes: z.number().int().positive(),
  transitionMinutes: z.number().int().nonnegative(),
  intensity: z.number().int().min(1).max(10),
  plannedLoad: w3LoadSchema,
  focus: z.string().optional(),
  drillId: w3IdSchema.optional(),
  drillVersionId: w3IdSchema.optional(),
  estimatedTouches: z.number().int().nonnegative().optional(),
  estimatedJumps: z.number().int().nonnegative().optional(),
  estimatedMetres: z.number().int().nonnegative().optional(),
  estimateSource: trainingProgramsEstimateSourceSchema,
  locked: z.boolean(),
  instructionsMarkdown: z.string().optional(),
});

export const trainingProgramsPlanTotalsSchema = z.object({
  minutes: z.number().int().nonnegative(),
  plannedMinutes: z.number().int().positive(),
  /** Duration-weighted mean of block loads. */
  load: w3LoadSchema,
  targetLoad: w3LoadSchema.optional(),
  touches: z.number().int().nonnegative(),
  jumps: z.number().int().nonnegative(),
  metres: z.number().int().nonnegative(),
  /** "1:1.5" */
  workRestRatio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
  focusMix: z.array(
    z.object({ focus: z.string().min(1), percent: z.number().min(0).max(100) }),
  ),
});

export const trainingProgramsPracticePlanSummarySchema = z.object({
  id: w3IdSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  status: trainingProgramsPlanStatusSchema,
  durationMinutes: z.number().int().min(1).max(720),
  plannedLoad: w3LoadSchema,
  version: z.number().int().positive(),
  updatedAt: w3DateTimeSchema,
});

export const trainingProgramsPracticePlanSchema =
  trainingProgramsPracticePlanSummarySchema.extend({
    purpose: z.string(),
    targetAudience: z.string(),
    versionId: w3IdSchema,
    targetLoad: w3LoadSchema.optional(),
    assumptions: trainingProgramsPlanAssumptionsSchema,
    blocks: z.array(trainingProgramsBlockSchema),
    totals: trainingProgramsPlanTotalsSchema,
    /** Where it is used: program, phase and session. */
    programId: w3IdSchema.optional(),
    phase: trainingProgramsWeekPhaseSchema.optional(),
    sessionId: w3IdSchema.optional(),
  });

export const trainingProgramsPracticePlansInputSchema = z.object({
  status: trainingProgramsPlanStatusSchema.optional(),
});
export const trainingProgramsPracticePlansSchema = z.object({
  items: z.array(trainingProgramsPracticePlanSummarySchema),
});
export const trainingProgramsPracticePlanInputSchema = z.object({
  practicePlanId: w3IdSchema,
});
/** Saving makes a new immutable plan version. */
export const trainingProgramsSavePracticePlanInputSchema = z.object({
  practicePlanId: w3IdSchema.optional(),
  title: z.string().min(1).max(160),
  purpose: z.string().max(2000).default(""),
  targetAudience: z.string().max(500).default(""),
  status: trainingProgramsPlanStatusSchema.default("draft"),
  targetLoad: w3LoadSchema.optional(),
  assumptions: trainingProgramsPlanAssumptionsSchema,
  blocks: z.array(trainingProgramsBlockSchema.omit({ id: true })).max(60),
  changeNote: z.string().max(500).optional(),
  idempotencyKey: w3IdempotencyKeySchema,
});
/** Duna assumes focus, timing, load, contacts and jumps; the coach edits. */
export const trainingProgramsProposePracticePlanInputSchema = z.object({
  assumptions: trainingProgramsPlanAssumptionsSchema,
  durationMinutes: z.number().int().min(10).max(360),
  focus: z.string().max(200).optional(),
  sessionId: w3IdSchema.optional(),
});

// ------------------------------------------------------------------ player

export const trainingProgramsMyScheduleInputSchema = z.object({
  from: w3DateTimeSchema,
  to: w3DateTimeSchema,
});

export type TrainingProgramsProgram = z.infer<
  typeof trainingProgramsProgramSchema
>;
export type TrainingProgramsSession = z.infer<
  typeof trainingProgramsSessionSchema
>;
export type TrainingProgramsPracticePlan = z.infer<
  typeof trainingProgramsPracticePlanSchema
>;
export type TrainingProgramsConflict = z.infer<
  typeof trainingProgramsConflictSchema
>;
