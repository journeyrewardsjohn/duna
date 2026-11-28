/**
 * Contract: team-availability (owner: B3a). Named availability schedules
 * with effective dates and weekly windows, blackouts, time off, the coverage
 * grid, and coverage requests with ranked substitutes. Frozen by W3-0: B3a
 * implements the service behind these shapes; H5 builds TM-Availability and
 * TM-Coverage against them and `@duna/core/demo/team-availability`.
 * Procedures: `operator.teamAvailability.*` (docs/plan/w3-contracts.md).
 */
import {
  staffCoverageOfferStatuses,
  staffCoverageReasons,
  staffCoverageStatuses,
  staffScheduleStatuses,
  staffTimeOffStatuses,
  staffWindowKinds,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3PersonRefSchema,
  w3TimeOfDaySchema,
  w3WeekdaySchema,
} from "./w3-common";

export const teamAvailabilityScheduleStatusSchema = z.enum(
  staffScheduleStatuses,
);
export const teamAvailabilityWindowKindSchema = z.enum(staffWindowKinds);
export const teamAvailabilityTimeOffStatusSchema = z.enum(staffTimeOffStatuses);
export const teamAvailabilityCoverageStatusSchema = z.enum(
  staffCoverageStatuses,
);
export const teamAvailabilityCoverageReasonSchema =
  z.enum(staffCoverageReasons);
export const teamAvailabilityOfferStatusSchema = z.enum(
  staffCoverageOfferStatuses,
);

/** One staff member (a row of organization_staff_profiles). */
export const teamAvailabilityStaffRefSchema = w3PersonRefSchema.extend({
  staffProfileId: w3IdSchema,
});

export const teamAvailabilityWindowSchema = z.object({
  id: w3IdSchema,
  weekday: w3WeekdaySchema,
  startsAt: w3TimeOfDaySchema,
  endsAt: w3TimeOfDaySchema,
  kind: teamAvailabilityWindowKindSchema,
  label: z.string().max(80).optional(),
  venueId: w3IdSchema.optional(),
});

export const teamAvailabilityScheduleSchema = z.object({
  id: w3IdSchema,
  staffProfileId: w3IdSchema,
  name: z.string().min(1).max(80),
  status: teamAvailabilityScheduleStatusSchema,
  effectiveFrom: w3DateSchema,
  effectiveTo: w3DateSchema.optional(),
  timezone: z.string().min(1),
  /** The sentence it was written from ("Mon and Wed 3 to 8"). */
  sourceText: z.string().max(2000).optional(),
  windows: z.array(teamAvailabilityWindowSchema),
  updatedAt: w3DateTimeSchema,
});

export const teamAvailabilityBlackoutSchema = z.object({
  id: w3IdSchema,
  staffProfileId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  reason: z.string().max(500).optional(),
  /** Sessions in the window that now need cover (derived). */
  sessionsNeedingCover: z.number().int().nonnegative(),
});

export const teamAvailabilityTimeOffSchema = z.object({
  id: w3IdSchema,
  staffProfileId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  reason: z.string().max(500).optional(),
  status: teamAvailabilityTimeOffStatusSchema,
  requestedAt: w3DateTimeSchema,
  decidedAt: w3DateTimeSchema.optional(),
  decidedBy: w3PersonRefSchema.optional(),
  decisionNote: z.string().max(500).optional(),
  sessionsNeedingCover: z.number().int().nonnegative(),
});

/** TM-Availability: one staff member's availability page. */
export const teamAvailabilityStaffSchema = z.object({
  staff: teamAvailabilityStaffRefSchema,
  schedules: z.array(teamAvailabilityScheduleSchema),
  blackouts: z.array(teamAvailabilityBlackoutSchema),
  timeOff: z.array(teamAvailabilityTimeOffSchema),
});

export const teamAvailabilityStaffInputSchema = z.object({
  staffProfileId: w3IdSchema,
});

export const teamAvailabilityUpsertScheduleInputSchema = z.object({
  /** Omit to create. */
  scheduleId: w3IdSchema.optional(),
  staffProfileId: w3IdSchema,
  name: z.string().min(1).max(80),
  effectiveFrom: w3DateSchema,
  effectiveTo: w3DateSchema.optional(),
  timezone: z.string().min(1),
  sourceText: z.string().max(2000).optional(),
  windows: z.array(teamAvailabilityWindowSchema.omit({ id: true })).max(56),
});

export const teamAvailabilityScheduleTransitionInputSchema = z.object({
  scheduleId: w3IdSchema,
  /** draft → active | fallback; active | fallback → archived. */
  to: z.enum(["active", "fallback", "archived"]),
});

export const teamAvailabilityAddBlackoutInputSchema = z.object({
  staffProfileId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  reason: z.string().max(500).optional(),
});
export const teamAvailabilityRemoveBlackoutInputSchema = z.object({
  blackoutId: w3IdSchema,
});

export const teamAvailabilityRequestTimeOffInputSchema = z.object({
  staffProfileId: w3IdSchema,
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  reason: z.string().max(500).optional(),
});
export const teamAvailabilityDecideTimeOffInputSchema = z.object({
  timeOffId: w3IdSchema,
  decision: z.enum(["approved", "declined", "cancelled"]),
  note: z.string().max(500).optional(),
});

/** TM-Coverage grid: hour × weekday, sessions against coaches free. */
export const teamAvailabilityCoverageGridInputSchema = z.object({
  weekStartsOn: w3DateSchema,
});
export const teamAvailabilityCoverageCellSchema = z.object({
  weekday: w3WeekdaySchema,
  hour: z.number().int().min(0).max(23),
  sessions: z.number().int().nonnegative(),
  coachesFree: z.number().int().nonnegative(),
  /** sessions > 0 and coachesFree < sessions. */
  short: z.boolean(),
});
export const teamAvailabilityCoverageGridSchema = z.object({
  weekStartsOn: w3DateSchema,
  timezone: z.string().min(1),
  cells: z.array(teamAvailabilityCoverageCellSchema),
});

export const teamAvailabilityOfferSchema = z.object({
  id: w3IdSchema,
  staff: teamAvailabilityStaffRefSchema,
  rank: z.number().int().nonnegative(),
  status: teamAvailabilityOfferStatusSchema,
  rationale: z.string().max(500).optional(),
  askedAt: w3DateTimeSchema.optional(),
  respondedAt: w3DateTimeSchema.optional(),
});

export const teamAvailabilityCoverageRequestSchema = z.object({
  id: w3IdSchema,
  /** Exactly one target: a session or a training event. */
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("session"), sessionId: w3IdSchema }),
    z.object({
      kind: z.literal("training-event"),
      trainingEventId: w3IdSchema,
    }),
  ]),
  title: z.string().min(1),
  startsAt: w3DateTimeSchema,
  endsAt: w3DateTimeSchema,
  originalStaff: teamAvailabilityStaffRefSchema.optional(),
  reason: teamAvailabilityCoverageReasonSchema,
  status: teamAvailabilityCoverageStatusSchema,
  coveredBy: teamAvailabilityStaffRefSchema.optional(),
  offers: z.array(teamAvailabilityOfferSchema),
  resolvedAt: w3DateTimeSchema.optional(),
});

export const teamAvailabilityCoverageRequestsInputSchema = z.object({
  status: z.array(teamAvailabilityCoverageStatusSchema).optional(),
  from: w3DateTimeSchema.optional(),
  to: w3DateTimeSchema.optional(),
});
export const teamAvailabilityCoverageRequestsSchema = z.object({
  requests: z.array(teamAvailabilityCoverageRequestSchema),
});

export const teamAvailabilityCoverageActionInputSchema = z.discriminatedUnion(
  "action",
  [
    /** Recompute ranked suggestions (pure, packages/scheduling). */
    z.object({ action: z.literal("suggest"), requestId: w3IdSchema }),
    /** Mark an offer asked; the message itself goes through Concierge with a person's Send. */
    z.object({
      action: z.literal("ask"),
      requestId: w3IdSchema,
      offerId: w3IdSchema,
    }),
    z.object({
      action: z.literal("assign"),
      requestId: w3IdSchema,
      offerId: w3IdSchema,
    }),
    z.object({
      action: z.literal("decline"),
      requestId: w3IdSchema,
      offerId: w3IdSchema,
    }),
    z.object({ action: z.literal("cancel"), requestId: w3IdSchema }),
  ],
);

export type TeamAvailabilitySchedule = z.infer<
  typeof teamAvailabilityScheduleSchema
>;
export type TeamAvailabilityStaff = z.infer<typeof teamAvailabilityStaffSchema>;
export type TeamAvailabilityCoverageRequest = z.infer<
  typeof teamAvailabilityCoverageRequestSchema
>;
export type TeamAvailabilityCoverageGrid = z.infer<
  typeof teamAvailabilityCoverageGridSchema
>;
