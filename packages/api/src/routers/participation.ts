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
  adultProcedure,
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
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
  participationCancelPreviewInputSchema,
  participationCancelPreviewSchema,
  participationResolveCancelRequestInputSchema,
  participationResolveCancelRequestSchema,
  participationShareLinkInputSchema,
  participationCreateInviteInputSchema,
  participationInviteInputSchema,
  participationInviteLinkSchema,
  participationInviteSchema,
  participationJoinWaitlistInputSchema,
  participationJoinWaitlistSchema,
  participationKeepRuleInputSchema,
  participationKeepRuleSchema,
  participationLeaveWaitlistInputSchema,
  participationLeaveWaitlistSchema,
  participationMergeDivisionsInputSchema,
  participationMergeDivisionsSchema,
  participationMergeSessionsInputSchema,
  participationMergeSessionsSchema,
  participationRuleToReviewSchema,
  participationSetPickupRuleInputSchema,
  participationSetSubjectRuleInputSchema,
} from "../contracts/participation";
import {
  createOperatorShareLink,
  createParticipationInvite,
  resolveParticipationInvite,
} from "../services/participation/invites";
import {
  mergeParticipationDivisions,
  mergeParticipationSessions,
} from "../services/participation/merge";
import {
  participationRulesToReview,
  reviewSubjectParticipationRule,
  setSubjectParticipationRule,
} from "../services/participation/subject-rules";
import { loadSubjectFacts } from "../services/participation/subjects";
import {
  joinParticipationWaitlist,
  leaveParticipationWaitlist,
} from "../services/participation/waitlist";
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
  previewParticipationCancel,
  previewParticipationRuleChange,
  resolveParticipationCancelRequest,
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

  /**
   * PART-B: exactly what cancelling would return to whom, from the plan
   * `cancelSession` runs. Read-only. Amounts need `payments:read`; without
   * it, names and methods only.
   */
  cancelPreview: read
    .input(participationCancelPreviewInputSchema)
    .output(participationCancelPreviewSchema)
    .query(({ ctx, input }) => {
      const includeMoney = actorHasScope(ctx.actor, "payments:read");
      if (usesDemoData()) {
        const demo = participationDemo.cancelPreview;
        if (includeMoney) return demo;
        return {
          ...demo,
          bookings: demo.bookings.map((booking) => ({
            bookingId: booking.bookingId,
            displayName: booking.displayName,
            isMinor: booking.isMinor,
            quantity: booking.quantity,
            method: booking.method,
            outcome: booking.outcome,
          })),
          totals: {
            bookings: demo.totals.bookings,
            places: demo.totals.places,
            released: demo.totals.released,
            reviewRequired: demo.totals.reviewRequired,
            cardRefunds: demo.totals.cardRefunds,
          },
        };
      }
      return guarded(() =>
        previewParticipationCancel({
          organizationId: ctx.organizationId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          includeMoney,
          now: ctx.now,
        }),
      );
    }),

  /**
   * PART-B: a director approves (the same cancellation as `cancelSession`,
   * needs `payments:write`) or declines a coach's request to cancel.
   */
  resolveCancelRequest: write
    .use(interventions)
    .input(participationResolveCancelRequestInputSchema)
    .output(participationResolveCancelRequestSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return input.decision === "approve"
          ? participationDemo.cancelRequestApproved
          : participationDemo.cancelRequestDeclined;
      }
      return idempotent({
        ctx,
        procedure: "resolveCancelRequest",
        key: input.idempotencyKey,
        // The note is for Send review only: never stored or logged here.
        request: { ...input, note: undefined },
        execute: () =>
          resolveParticipationCancelRequest({
            actor: ctx.actor,
            organizationId: ctx.organizationId,
            cancelRequestId: input.requestId,
            decision: input.decision,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** PART-B: a share link for one of the club's sessions (same links as player invites). */
  shareLink: read
    .use(
      rateLimitMiddleware({
        id: "participation-share-link",
        capacity: 20,
        refillPerMinute: 10,
      }),
    )
    .input(participationShareLinkInputSchema)
    .output(participationInviteLinkSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.shareLink;
      return guarded(() =>
        createOperatorShareLink({
          organizationId: ctx.organizationId,
          actorPersonId: ctx.actor.personId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          requestId: ctx.requestId,
          now: ctx.now,
        }),
      );
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

  /** Merge a thin session into another of the same offering (strong tier). */
  mergeSessions: money
    .use(interventions)
    .input(participationMergeSessionsInputSchema)
    .output(participationMergeSessionsSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.mergeSessions;
      return idempotent({
        ctx,
        procedure: "mergeSessions",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          mergeParticipationSessions({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            fromOccurrenceId: input.fromOccurrenceId,
            intoOccurrenceId: input.intoOccurrenceId,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** Merge two thin divisions of one event (moves registrations; no money moves). */
  mergeDivisions: write
    .use(interventions)
    .input(participationMergeDivisionsInputSchema)
    .output(participationMergeDivisionsSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.mergeDivisions;
      return idempotent({
        ctx,
        procedure: "mergeDivisions",
        key: input.idempotencyKey,
        request: input,
        execute: async () => {
          const facts = await loadSubjectFacts(
            "division",
            input.fromDivisionId,
          );
          if (!facts || facts.organizationId !== ctx.organizationId) {
            throw new ParticipationError(
              "NOT_FOUND",
              "This division was not found.",
            );
          }
          return mergeParticipationDivisions({
            actorPersonId: ctx.actor.personId,
            fromDivisionId: input.fromDivisionId,
            intoDivisionId: input.intoDivisionId,
            now: ctx.now,
          });
        },
      });
    }),

  /** A group rule on an event session, a division or a club pickup. */
  setSubjectRule: write
    .use(interventions)
    .input(participationSetSubjectRuleInputSchema)
    .output(participationSetDefaultsResultSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.subjectRule;
      return idempotent({
        ctx,
        procedure: "setSubjectRule",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          setSubjectParticipationRule({
            organizationId: ctx.organizationId,
            actorPersonId: ctx.actor.personId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            rules: input.rules,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

  /** "Rules to review": legacy minimums mapped to "run" (decision 7). */
  rulesToReview: read
    .output(z.array(participationRuleToReviewSchema))
    .query(({ ctx }) => {
      if (usesDemoData()) return participationDemo.rulesToReview;
      return guarded(async () => [
        ...(await participationRulesToReview({
          organizationId: ctx.organizationId,
          now: ctx.now,
        })),
      ]);
    }),

  /** Keep a reviewed legacy rule as it is ("Turn on cancel" uses setSubjectRule). */
  keepRule: write
    .input(participationKeepRuleInputSchema)
    .output(participationKeepRuleSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.keptRule;
      return idempotent({
        ctx,
        procedure: "keepRule",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          reviewSubjectParticipationRule({
            actor: ctx.actor,
            organizationId: ctx.organizationId,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            now: ctx.now,
          }),
      });
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

const waitlistWrites = rateLimitMiddleware({
  id: "participation-waitlist",
  capacity: 20,
  refillPerMinute: 10,
});

export const participationPublicRouter = router({
  /** The invite landing (`/i/[code]`): no names, no roster. */
  invite: publicProcedure
    .use(
      rateLimitMiddleware({
        id: "participation-invite",
        capacity: 60,
        refillPerMinute: 30,
      }),
    )
    .input(participationInviteInputSchema)
    .output(participationInviteSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.invite;
      return guarded(() =>
        resolveParticipationInvite({ code: input.code, now: ctx.now }),
      );
    }),
});

export const participationPlayerRouter = router({
  joinWaitlist: protectedProcedure
    .use(waitlistWrites)
    .input(participationJoinWaitlistInputSchema)
    .output(participationJoinWaitlistSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.waitlistJoined;
      return idempotent({
        ctx,
        procedure: "joinWaitlist",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          joinParticipationWaitlist({
            actor: ctx.actor,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            participantPersonId: input.participantPersonId,
            quantity: input.quantity,
            now: ctx.now,
          }),
      });
    }),

  leaveWaitlist: protectedProcedure
    .use(waitlistWrites)
    .input(participationLeaveWaitlistInputSchema)
    .output(participationLeaveWaitlistSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.waitlistLeft;
      return idempotent({
        ctx,
        procedure: "leaveWaitlist",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          leaveParticipationWaitlist({
            actor: ctx.actor,
            entryId: input.entryId,
            now: ctx.now,
          }),
      });
    }),

  /** A share link for a session I hold a place in (never a junior account). */
  createInvite: adultProcedure
    .input(participationCreateInviteInputSchema)
    .output(participationInviteLinkSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.inviteLink;
      return guarded(() =>
        createParticipationInvite({
          actor: ctx.actor,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          now: ctx.now,
        }),
      );
    }),

  /** A player hosting a pickup sets its group rule. */
  setPickupRule: protectedProcedure
    .input(participationSetPickupRuleInputSchema)
    .output(participationSetDefaultsResultSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return participationDemo.subjectRule;
      return idempotent({
        ctx,
        procedure: "setPickupRule",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          setSubjectParticipationRule({
            hostPersonId: ctx.actor.personId,
            actorPersonId: ctx.actor.personId,
            subjectType: "pickup-session",
            subjectId: input.pickupSessionId,
            rules: input.rules,
            requestId: ctx.requestId,
            now: ctx.now,
          }),
      });
    }),

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
