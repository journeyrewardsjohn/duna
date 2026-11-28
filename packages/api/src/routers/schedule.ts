/**
 * Router seam: schedule (owner: SCHED-API). The front desk's court
 * bookings, moves, cancellations, desk payments and calendar blocks, for
 * HQ's Schedule. Shapes in ../contracts/schedule.ts; services in
 * ../services/schedule/.
 *
 * Mounted once in ../router.ts as `operator.schedule`
 * (organizationProcedure: signed in, scope checked, organisation resolved
 * server-side; another club's ids answer NOT_FOUND):
 *   reads and previews       "sessions:read"
 *   create / move / cancel   "sessions:write" (+ "payments:write" for a
 *                            staff price, a free booking of paid time, or a
 *                            cancellation that refunds money)
 *   remove a block           "sessions:write"
 *   desk payment             "payments:collect" (+ "sessions:write")
 *   bookingPayments          a money permission (payments:read / write /
 *                            collect)
 *
 * Every write takes an idempotency key (a retry replays the first answer);
 * a cancellation, a desk payment and a price-changing move also need the
 * person's confirmation (`confirmed: true` / `confirmedPriceChange`) and
 * refuse a stale preview (`previewToken`). Nothing here sends anything:
 * moves and cancellations answer a draft for Inbox. Demo mode answers the
 * would-be result from @duna/core/demo/schedule.
 */
import {
  scheduleDemoBlock,
  scheduleDemoBooking,
  scheduleDemoCancelledUnder,
  scheduleDemoCurrency,
  scheduleDemoIds,
  scheduleDemoRateMinor,
  scheduleDemoRecipients,
} from "@duna/core/demo/schedule";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, rateLimitMiddleware, router } from "../auth";
import type { ApiContext } from "../context";
import {
  scheduleBookingPaymentsInputSchema,
  scheduleBookingPaymentsSchema,
  scheduleCancelCourtBookingInputSchema,
  scheduleCancelCourtBookingPreviewInputSchema,
  scheduleCancelCourtBookingPreviewSchema,
  scheduleCancelCourtBookingSchema,
  scheduleCreateCourtBookingInputSchema,
  scheduleCreateCourtBookingPreviewInputSchema,
  scheduleCreateCourtBookingPreviewSchema,
  scheduleCreateCourtBookingSchema,
  scheduleMoveCourtBookingInputSchema,
  scheduleMoveCourtBookingPreviewInputSchema,
  scheduleMoveCourtBookingPreviewSchema,
  scheduleMoveCourtBookingSchema,
  scheduleRecordDeskPaymentInputSchema,
  scheduleRecordDeskPaymentSchema,
  scheduleRemoveCalendarBlockInputSchema,
  scheduleRemoveCalendarBlockPreviewInputSchema,
  scheduleRemoveCalendarBlockPreviewSchema,
  scheduleRemoveCalendarBlockSchema,
} from "../contracts/schedule";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
  executeIdempotent,
} from "../idempotency";
import { usesDemoData } from "../services/data-source";
import * as service from "../services/schedule";
import { canSeeMoney, ScheduleError } from "../services/schedule";

const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");
const collect = organizationProcedure("payments:collect");
const deskWrites = rateLimitMiddleware({
  id: "schedule-desk-write",
  capacity: 60,
  refillPerMinute: 30,
});
const deskReads = rateLimitMiddleware({
  id: "schedule-desk-read",
  capacity: 240,
  refillPerMinute: 240,
});

function toTrpcError(error: unknown): never {
  if (error instanceof ScheduleError) {
    throw new TRPCError({
      code:
        error.code === "DATABASE_REQUIRED"
          ? "PRECONDITION_FAILED"
          : error.code,
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
          procedure: `schedule.${input.procedure}`,
          personId: input.ctx.actor?.personId,
          organizationId: input.ctx.actor?.organizationId,
          request: JSON.parse(JSON.stringify(input.request)),
          now: input.ctx.now,
          execute: input.execute,
        })
      ).result,
  );
}

function caller(ctx: {
  readonly actor: service.ScheduleCaller["actor"];
  readonly organizationId: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): service.ScheduleCaller {
  return {
    actor: ctx.actor,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    now: ctx.now,
    ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
  };
}

function requireScope(
  ctx: { readonly actor: service.ScheduleCaller["actor"] },
  scope: string,
): void {
  if (!ctx.actor.scopes.includes("*") && !ctx.actor.scopes.includes(scope)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Missing required scope: ${scope}`,
    });
  }
}

const demoDraft = (body: string) => ({
  recipients: scheduleDemoRecipients,
  body,
});

export const scheduleOperatorRouter = router({
  /** Is the slot free by the shared rule, and what would it cost? */
  createCourtBookingPreview: read
    .use(deskReads)
    .input(scheduleCreateCourtBookingPreviewInputSchema)
    .output(scheduleCreateCourtBookingPreviewSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        const rate = scheduleDemoRateMinor(input.startsAt, input.endsAt);
        return {
          available: true,
          conflicts: [],
          ...(canSeeMoney(ctx.actor)
            ? {
                price: {
                  rateMinor: rate,
                  totalMinor: input.paymentIntent === "free" ? 0 : rate,
                  currency: scheduleDemoCurrency,
                  ratePlanName: "Court hire",
                  priceKind: "public" as const,
                },
              }
            : {}),
          paymentLinkAvailable: false,
          timeZone: "America/Los_Angeles",
        };
      }
      return guarded(() =>
        service.previewCreateCourtBooking(caller(ctx), input),
      );
    }),

  /** A court booking from the desk: a member or a walk-in. */
  createCourtBooking: write
    .use(deskWrites)
    .input(scheduleCreateCourtBookingInputSchema)
    .output(scheduleCreateCourtBookingSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        if (input.priceMinor !== undefined) requireScope(ctx, "payments:write");
        const total =
          input.paymentIntent === "free"
            ? 0
            : (input.priceMinor ??
              scheduleDemoRateMinor(input.startsAt, input.endsAt));
        return {
          id: scheduleDemoIds.booking,
          status: "confirmed" as const,
          paymentState: total === 0 ? ("free" as const) : ("unpaid" as const),
          ...(total > 0 && input.paymentIntent === "pay-at-desk"
            ? { orderId: scheduleDemoIds.order }
            : {}),
          ...(canSeeMoney(ctx.actor) ? { totalMinor: total } : {}),
          currency: scheduleDemoCurrency,
          priceSource:
            input.paymentIntent === "free"
              ? ("free" as const)
              : input.priceMinor !== undefined
                ? ("staff" as const)
                : ("rate" as const),
        };
      }
      return idempotent({
        ctx,
        procedure: "createCourtBooking",
        key: input.idempotencyKey,
        request: input,
        execute: () => service.createCourtBooking(caller(ctx), input),
      });
    }),

  /** What a move changes: availability, price, who would be told. */
  moveCourtBookingPreview: read
    .use(deskReads)
    .input(scheduleMoveCourtBookingPreviewInputSchema)
    .output(scheduleMoveCourtBookingPreviewSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        const booking = scheduleDemoBooking;
        return {
          bookingId: input.bookingId,
          from: {
            courtId: booking.courtId,
            courtName: booking.courtName,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
          },
          to: {
            courtId: input.courtId ?? booking.courtId,
            courtName: booking.courtName,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
          },
          available: true,
          conflicts: [],
          price: {
            action: "kept" as const,
            ...(canSeeMoney(ctx.actor)
              ? {
                  currentTotalMinor: booking.totalMinor,
                  newTotalMinor: booking.totalMinor,
                  differenceMinor: 0,
                  currency: scheduleDemoCurrency,
                }
              : {}),
          },
          requiresPriceConfirmation: false,
          materialChange:
            Math.abs(Date.parse(input.startsAt) - Date.parse(booking.startsAt)) >=
            3_600_000,
          draft: demoDraft(
            `Your court booking at ${booking.venueName} · ${booking.courtName} has moved.`,
          ),
          previewToken: "demo-preview-token",
        };
      }
      return guarded(() => service.previewMoveCourtBooking(caller(ctx), input));
    }),

  moveCourtBooking: write
    .use(deskWrites)
    .input(scheduleMoveCourtBookingInputSchema)
    .output(scheduleMoveCourtBookingSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const booking = scheduleDemoBooking;
        return {
          id: input.bookingId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          courtId: input.courtId ?? booking.courtId,
          undo: {
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            courtId: booking.courtId,
          },
          toTell: input.notify ? scheduleDemoRecipients.length : 0,
          sent: 0 as const,
          ...(input.notify
            ? {
                draft: demoDraft(
                  `Your court booking at ${booking.venueName} · ${booking.courtName} has moved.`,
                ),
              }
            : {}),
          repriced: false,
        };
      }
      return idempotent({
        ctx,
        procedure: "moveCourtBooking",
        key: input.idempotencyKey,
        request: input,
        execute: () => service.moveCourtBooking(caller(ctx), input),
      });
    }),

  /** Exactly who gets what back, by the same plan the cancellation runs. */
  cancelCourtBookingPreview: read
    .use(deskReads)
    .input(scheduleCancelCourtBookingPreviewInputSchema)
    .output(scheduleCancelCourtBookingPreviewSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        const booking = scheduleDemoBooking;
        const refund =
          input.cause === "club" || input.refund !== "none"
            ? booking.totalMinor
            : 0;
        const showMoney = canSeeMoney(ctx.actor);
        return {
          bookingId: input.bookingId,
          refund: input.refund,
          cause: input.cause,
          policy: {
            title: "Reservation cancellation policy",
            refundBeforeHours: 24,
            insideRefundWindow: true,
          },
          lines: [
            {
              participantId: scheduleDemoIds.organizerRow,
              orderId: booking.orderId,
              name: booking.booker.name,
              method: "card" as const,
              action:
                refund > 0 ? ("refund-card" as const) : ("keep" as const),
              ...(showMoney
                ? { paidMinor: booking.totalMinor, refundMinor: refund }
                : {}),
            },
            {
              participantId: scheduleDemoIds.invitedRow,
              name: booking.invited.name,
              method: "nothing-paid" as const,
              action: "release" as const,
              ...(showMoney ? { paidMinor: 0, refundMinor: 0 } : {}),
            },
          ],
          ...(showMoney
            ? { totalRefundMinor: refund, currency: scheduleDemoCurrency }
            : {}),
          needsMoneyPermission: refund > 0,
          draft: demoDraft(
            `Your court booking at ${booking.venueName} · ${booking.courtName} is cancelled. Any refund goes back the way you paid.`,
          ),
          previewToken: "demo-preview-token",
        };
      }
      return guarded(() =>
        service.previewCancelCourtBooking(caller(ctx), input),
      );
    }),

  cancelCourtBooking: write
    .use(deskWrites)
    .input(scheduleCancelCourtBookingInputSchema)
    .output(scheduleCancelCourtBookingSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const booking = scheduleDemoBooking;
        const refund =
          input.cause === "club" || input.refund !== "none"
            ? booking.totalMinor
            : 0;
        if (refund > 0) requireScope(ctx, "payments:write");
        const showMoney = canSeeMoney(ctx.actor);
        return {
          id: input.bookingId,
          status: "cancelled" as const,
          lines: [
            {
              participantId: scheduleDemoIds.organizerRow,
              orderId: booking.orderId,
              name: booking.booker.name,
              method: "card" as const,
              action:
                refund > 0 ? ("refund-card" as const) : ("keep" as const),
              ...(showMoney
                ? { paidMinor: booking.totalMinor, refundMinor: refund }
                : {}),
              outcome:
                refund > 0
                  ? ("refund-submitted" as const)
                  : ("kept" as const),
              ...(refund > 0 ? { refundId: scheduleDemoIds.refund } : {}),
            },
          ],
          ...(showMoney
            ? { totalRefundMinor: refund, currency: scheduleDemoCurrency }
            : {}),
          toTell: scheduleDemoRecipients.length,
          sent: 0 as const,
          draft: demoDraft(
            `Your court booking at ${booking.venueName} · ${booking.courtName} is cancelled. Any refund goes back the way you paid.`,
          ),
        };
      }
      return idempotent({
        ctx,
        procedure: "cancelCourtBooking",
        key: input.idempotencyKey,
        request: input,
        execute: () => service.cancelCourtBooking(caller(ctx), input),
      });
    }),

  /** Money taken at the desk, recorded against the booking's order. */
  recordDeskPayment: collect
    .use(deskWrites)
    .input(scheduleRecordDeskPaymentInputSchema)
    .output(scheduleRecordDeskPaymentSchema)
    .mutation(({ ctx, input }) => {
      requireScope(ctx, "sessions:write");
      if (usesDemoData()) {
        return {
          id: scheduleDemoIds.deskPaymentAudit,
          orderId: input.orderId ?? scheduleDemoIds.order,
          bookingId: input.bookingId ?? scheduleDemoIds.booking,
          orderStatus: "paid" as const,
          amountMinor: input.amountMinor,
          currency: scheduleDemoCurrency,
          method: input.method,
          ledgerRecorded: false as const,
        };
      }
      return idempotent({
        ctx,
        procedure: "recordDeskPayment",
        key: input.idempotencyKey,
        request: input,
        execute: () => service.recordDeskPayment(caller(ctx), input),
      });
    }),

  /** What removing a block does, and what was cancelled under it. */
  removeCalendarBlockPreview: read
    .use(deskReads)
    .input(scheduleRemoveCalendarBlockPreviewInputSchema)
    .output(scheduleRemoveCalendarBlockPreviewSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          ...scheduleDemoBlock,
          id: input.id,
          kind:
            input.scope === "this" ? ("one-off" as const) : ("weekly" as const),
          scope: input.scope,
          cancelledUnder:
            input.id === scheduleDemoBlock.id ? scheduleDemoCancelledUnder : [],
        };
      }
      return guarded(() =>
        service.previewRemoveCalendarBlock(caller(ctx), input),
      );
    }),

  removeCalendarBlock: write
    .use(deskWrites)
    .input(scheduleRemoveCalendarBlockInputSchema)
    .output(scheduleRemoveCalendarBlockSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const cancelled =
          input.id === scheduleDemoBlock.id ? scheduleDemoCancelledUnder : [];
        if (cancelled.length > 0 && input.acknowledgeCancelled !== true) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "1 session or booking was cancelled under this closure. Removing it does not bring them back; acknowledge that to remove it. Nothing was removed.",
          });
        }
        return {
          id: input.id,
          removed: true,
          scope: input.scope,
          stillCancelled: cancelled.length,
        };
      }
      return idempotent({
        ctx,
        procedure: "removeCalendarBlock",
        key: input.idempotencyKey,
        request: input,
        execute: () => service.removeCalendarBlock(caller(ctx), input),
      });
    }),

  /** The calendar's money for court bookings in a range (one read). */
  bookingPayments: read
    .use(deskReads)
    .input(scheduleBookingPaymentsInputSchema)
    .output(scheduleBookingPaymentsSchema)
    .query(({ ctx, input }) => {
      if (!canSeeMoney(ctx.actor)) requireScope(ctx, "payments:read");
      if (usesDemoData()) {
        const booking = scheduleDemoBooking;
        const inRange =
          booking.startsAt < input.to && booking.endsAt > input.from;
        return {
          bookings: inRange
            ? [
                {
                  bookingId: booking.id,
                  orderId: booking.orderId,
                  totalMinor: booking.totalMinor,
                  paidMinor: 0,
                  currency: scheduleDemoCurrency,
                  paymentState: "unpaid" as const,
                  due: true,
                },
              ]
            : [],
        };
      }
      return guarded(() => service.bookingPayments(caller(ctx), input));
    }),
});

