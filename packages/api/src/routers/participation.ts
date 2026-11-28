/**
 * Router seam: participation (owner: PART-3). Group sessions that fill up:
 * the club default, previewing a rule change, the at-risk list, the
 * interventions (extend, run anyway, cancel with refunds, a coach's request
 * to cancel), attendance, and the player's one display model. Shapes in
 * ../contracts/participation.ts; services in ../services/participation/.
 *
 * Mounted once in ../router.ts:
 *   operator.participation  organizationProcedure: reads need
 *     "sessions:read"; extend / run / apply need "sessions:write"; cancel
 *     with refunds needs "payments:write" (owner). Attendance and the
 *     request to cancel accept the session's assigned coach with
 *     "sessions:read" (never a money permission).
 *   player.participation    protectedProcedure: the display model (quote).
 *
 * Every procedure returns its fixture from @duna/core/demo/participation in
 * demo mode. Mutations that move money or tell people carry
 * `confirmed: true` (the interaction kit's confirm / strong tier) and an
 * idempotency key; a retry with the same key replays the first answer.
 */
import { participationDemo } from "@duna/core/demo/participation";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  organizationProcedure,
  protectedProcedure,
  rateLimitMiddleware,
  router,
} from "../auth";
import type { ApiContext } from "../context";
import {
  participationApplyRuleToBookedInputSchema,
  participationApplyRuleToBookedSchema,
  participationAtRiskInputSchema,
  participationAtRiskSchema,
  participationCancelRequestSchema,
  participationCancelSessionInputSchema,
  participationCancelSessionSchema,
  participationDefaultsSchema,
  participationExtendLockInputSchema,
  participationExtendLockSchema,
  participationPreviewRuleChangeInputSchema,
  participationPreviewRuleChangeSchema,
  participationQuoteInputSchema,
  participationQuoteSchema,
  participationRecordAttendanceInputSchema,
  participationRecordAttendanceSchema,
  participationRequestCancelInputSchema,
  participationRequestCancelSchema,
  participationRunAnywayInputSchema,
  participationRunAnywaySchema,
  participationSetDefaultsInputSchema,
  participationSetDefaultsResultSchema,
} from "../contracts/participation";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
  executeIdempotent,
} from "../idempotency";
import { usesDemoData } from "../services/data-source";
import { ParticipationError } from "../services/participation/catalog";
import {
  actorHasScope,
  applyParticipationRuleToBooked,
  cancelParticipationSession,
  extendParticipationLock,
  getParticipationDefaults,
  listParticipationCancelRequests,
  participationAtRisk,
  previewParticipationRuleChange,
  recordParticipationAttendance,
  requestParticipationCancel,
  runParticipationAnyway,
  setParticipationDefaults,
} from "../services/participation/operator";
import { participationQuote } from "../services/participation/player";

const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");
const money = organizationProcedure("payments:write");
const interventions = rateLimitMiddleware({
  id: "participation-intervention",
  capacity: 30,
  refillPerMinute: 15,
});

function toTrpcError(error: unknown): never {
  if (error instanceof ParticipationError) {
    throw new TRPCError({
      code:
        error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : error.code === "DATABASE_REQUIRED"
              ? "PRECONDITION_FAILED"
              : error.code === "ALREADY_DECIDED" || error.code === "CONFLICT"
                ? "CONFLICT"
                : "BAD_REQUEST",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
  }
  throw error;
}

async function guarded<T>(execute: () => Promise<T>): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    return toTrpcError(error);
  }
}

async function idempotent<T extends object>(input: {
  readonly ctx: ApiContext;
  readonly procedure: string;
  readonly key: string;
  readonly request: Readonly<Record<string, unknown>>;
  readonly execute: () => Promise<T>;
}): Promise<T> {
  return guarded(
    async () =>
      (
        await executeIdempotent({
          key: input.key,
          procedure: `participation.${input.procedure}`,
          personId: input.ctx.actor?.personId,
          organizationId: input.ctx.actor?.organizationId,
          request: JSON.parse(JSON.stringify(input.request)),
          now: input.ctx.now,
          execute: input.execute,
        })
      ).result,
  );
}

export const participationOperatorRouter = router({
  /** The club default every offering inherits (Club setup › Booking rules). */
  defaults: read.output(participationDefaultsSchema).query(({ ctx }) => {
    if (usesDemoData()) return participationDemo.defaults;
    return guarded(() => getParticipationDefaults(ctx.organizationId));
  }),

  setDefaults: write
    .use(interventions)
    .input(participationSetDefaultsInputSchema)
    .output(participationSetDefaultsResultSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          rules: participationDemo.defaults.rules,
          issues: [],
          warnings: [],
        };
      }
      return idempotent({
        ctx,
        procedure: "setDefaults",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          setParticipationDefaults({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            rules: input.rules,
            appliesTo: input.appliesTo,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** What a rule change would do (HQ form, Ask Duna proposal cards). */
  previewRuleChange: read
    .input(participationPreviewRuleChangeInputSchema)
    .output(participationPreviewRuleChangeSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.preview;
      return guarded(() =>
        previewParticipationRuleChange({
          organizationId: ctx.organizationId,
          catalogItemId: input.catalogItemId,
          rules: input.rules,
          now: ctx.now,
        }),
      );
    }),

  /** Apply the offering's saved rule to booked sessions (loosening only). */
  applyRuleToBooked: write
    .use(interventions)
    .input(participationApplyRuleToBookedInputSchema)
    .output(participationApplyRuleToBookedSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.applied;
      return idempotent({
        ctx,
        procedure: "applyRuleToBooked",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          applyParticipationRuleToBooked({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            catalogItemId: input.catalogItemId,
            occurrenceIds: input.occurrenceIds,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** Today › "At risk this week". Money at stake needs `payments:read`. */
  atRisk: read
    .input(participationAtRiskInputSchema)
    .output(participationAtRiskSchema)
    .query(({ ctx, input }) => {
      const includeMoney = actorHasScope(ctx.actor, "payments:read");
      if (usesDemoData()) {
        if (includeMoney) return participationDemo.atRisk;
        return {
          sessions: participationDemo.atRisk.sessions.map((session) => {
            const copy: Partial<typeof session> = { ...session };
            delete copy.atStakeMinor;
            delete copy.atStakeCredits;
            return copy as Omit<
              typeof session,
              "atStakeMinor" | "atStakeCredits"
            >;
          }),
          totals: {
            sessions: participationDemo.atRisk.totals.sessions,
            booked: participationDemo.atRisk.totals.booked,
            currency: participationDemo.atRisk.totals.currency,
          },
        };
      }
      return guarded(() =>
        participationAtRisk({
          organizationId: ctx.organizationId,
          from: input?.from ? new Date(input.from) : undefined,
          to: input?.to ? new Date(input.to) : undefined,
          includeMoney,
          now: ctx.now,
        }),
      );
    }),

  extendLock: write
    .use(interventions)
    .input(participationExtendLockInputSchema)
    .output(participationExtendLockSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.extendLock;
      return idempotent({
        ctx,
        procedure: "extendLock",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          extendParticipationLock({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            lockAt: new Date(input.lockAt),
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  runAnyway: write
    .use(interventions)
    .input(participationRunAnywayInputSchema)
    .output(participationRunAnywaySchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.runAnyway;
      return idempotent({
        ctx,
        procedure: "runAnyway",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          runParticipationAnyway({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** Cancel and refund everyone (strong confirmation, `payments:write`). */
  cancelSession: money
    .use(interventions)
    .input(participationCancelSessionInputSchema)
    .output(participationCancelSessionSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.cancelSession;
      return idempotent({
        ctx,
        procedure: "cancelSession",
        key: input.idempotencyKey,
        // The note is for Send review only: never stored or logged here.
        request: { ...input, note: undefined },
        execute: async () => {
          const result = await cancelParticipationSession({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            reason: input.reason,
            requestId: ctx.requestId,
            now: ctx.now,
          });
          return {
            cancellations: result.cancellations.map((entry) => ({
              bookingId: entry.fulfillmentId,
              refundStatus: entry.refundStatus,
            })),
          };
        },
      });
    }),

  /** A coach asks a director to cancel (the coach's own sessions). */
  requestCancel: read
    .use(interventions)
    .input(participationRequestCancelInputSchema)
    .output(participationRequestCancelSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.cancelRequest;
      return idempotent({
        ctx,
        procedure: "requestCancel",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          requestParticipationCancel({
            actor: ctx.actor,
            organizationId: ctx.organizationId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            reason: input.reason,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** Open requests to cancel, for directors (Today / Pro). */
  cancelRequests: read
    .output(z.array(participationCancelRequestSchema))
    .query(({ ctx }) => {
      if (usesDemoData()) return participationDemo.cancelRequests;
      return guarded(async () =>
        (await listParticipationCancelRequests(ctx.organizationId)).map(
          (row) => ({
            id: row.id,
            subjectType: row.subjectType as "catalog-session-occurrence",
            subjectId: row.subjectId,
            requestedByPersonId: row.requestedByPersonId,
            reason: row.reason as "coach" | "weather" | "venue" | "other",
            status: row.status as "open",
            createdAt: row.createdAt.toISOString(),
          }),
        ),
      );
    }),

  /** Attendance: the assigned coach or staff with `sessions:write`; never a money scope. */
  recordAttendance: read
    .input(participationRecordAttendanceInputSchema)
    .output(participationRecordAttendanceSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.attendance;
      return idempotent({
        ctx,
        procedure: "recordAttendance",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          recordParticipationAttendance({
            actor: ctx.actor,
            organizationId: ctx.organizationId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            marks: input.marks.map((mark) => ({
              bookingId: mark.bookingId,
              status: mark.status,
              deviceMarkedAt: mark.deviceMarkedAt
                ? new Date(mark.deviceMarkedAt)
                : undefined,
            })),
            idempotencyKey: input.idempotencyKey,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),
});

export const participationPlayerRouter = router({
  /**
   * The display model for one session: status, the line under it, the price
   * ladder, what I reserve and the most I can be charged, free / late
   * cancellation, and whether I am already booked.
   */
  quote: protectedProcedure
    .input(participationQuoteInputSchema)
    .output(participationQuoteSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        return (
          participationDemo.quotes.find(
            (quote) => quote.subjectId === input.catalogSessionOccurrenceId,
          ) ?? participationDemo.quotes[0]!
        );
      }
      return guarded(() =>
        participationQuote({
          actor: ctx.actor,
          catalogItemId: input.catalogItemId,
          catalogSessionOccurrenceId: input.catalogSessionOccurrenceId,
          participantPersonId: input.participantPersonId,
          quantity: input.quantity,
          paymentMethod: input.paymentMethod,
          viewerTimeZone: input.viewerTimeZone,
          now: ctx.now,
        }),
      );
    }),
});
