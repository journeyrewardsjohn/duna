"use server";

import { scheduleDemoBlock, scheduleDemoIds } from "@duna/core/demo/schedule";
import { log } from "@duna/observability";
import { localDateOf, localMinuteOf, weekdayOfDate } from "@duna/scheduling";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { MoneyActionResult } from "@/components/money/money-action-result";
import { isNotConfiguredAnswer } from "@/components/money/money-data";
import type {
  BlockPreview,
  BlockScope,
  BookingCreated,
  BookingPreview,
  CancelCause,
  CancelPreview,
  DeskMethod,
  MovePreview,
  PaymentIntent,
  RefundChoice,
} from "@/components/schedule/schedule-desk";
import {
  DEMO_SCHEDULE_COOKIE,
  parseDemoSchedule,
  serializeDemoSchedule,
  type DemoScheduleStore,
} from "@/components/schedule/schedule-demo";
import type {
  CoachFacts,
  ItemKind,
  ItemSource,
} from "@/components/schedule/schedule-model";
import { getHqSession } from "@/components/shell/hq-session";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";

/**
 * Schedule's changes (H-SCHEDULE, H-SCHEDULE-2). Each is a person's
 * confirmed action from the calendar: the screen previews first (price,
 * conflicts, who would be told, who gets what back), asks, then calls one
 * of these with the idempotency key the confirming control made (reused on
 * retry). They answer a result instead of throwing, so the screen can say
 * what happened and give the reference. Court bookings, moves,
 * cancellations, desk payments and block removals go through
 * `operator.schedule.*` (SCHED-API), which sends nothing: moves and
 * cancellations answer a draft for Inbox. In demo mode (no Duna Database)
 * those procedures answer from their fixtures and the change is kept in a
 * cookie in the person's own browser, so the calendar shows it.
 */

type Result<T> = MoneyActionResult<T>;

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

const deniedWords = {
  change:
    "Your role can't change the schedule. Nothing was changed; the club's owner or front desk can.",
  read: "Your role can't see this. Nothing was changed; the club's owner or front desk can.",
  money:
    "Your role can't take or return money. Nothing was changed; the club's owner can, and the front desk can record desk payments.",
} as const;

async function run<T>(
  action: string,
  perform: () => Promise<T>,
  options: {
    /** A read (a preview): the calendar is not refreshed. */
    readonly read?: boolean;
    readonly denied?: keyof typeof deniedWords;
  } = {},
): Promise<Result<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    if (!options.read) revalidatePath("/schedule");
    log.info(
      options.read
        ? "hq.schedule.preview_succeeded"
        : "hq.schedule.action_succeeded",
      { action },
    );
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NotAvailableYet) {
      log.info("hq.schedule.action_not_available", { action });
      return {
        ok: false,
        code: "not-configured",
        message: error.message,
        reference: requestId,
      };
    }
    if (isPermissionDenied(error)) {
      log.info("hq.schedule.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          deniedWords[options.denied ?? (options.read ? "read" : "change")],
        reference: requestId,
      };
    }
    if (isNotConfiguredAnswer(error)) {
      return {
        ok: false,
        code: "not-configured",
        message:
          "This isn't set up in this environment yet. Nothing was changed.",
        reference: requestId,
      };
    }
    const code = codeOf(error);
    log.warn("hq.schedule.action_failed", { action, code: code ?? "unknown" });
    const said =
      code && plainCodes.has(code) && error instanceof Error && error.message
        ? error.message
        : undefined;
    return {
      ok: false,
      code: "failed",
      message: said
        ? /Nothing was/.test(said)
          ? said
          : `${said} Nothing was changed.`
        : "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

/** A change the API cannot make (said in words, nothing changed). */
class NotAvailableYet extends Error {}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = (value: string) =>
  uuidPattern.test(value) ? value : crypto.randomUUID();

/**
 * Demo mode answers `operator.schedule.*` from its fixtures, which take the
 * API's ids; the demo club's own items carry readable ids, so they are sent
 * as the fixture's. Real ids pass through.
 */
const asApiId = (value: string, demoFixture: string) =>
  uuidPattern.test(value) ? value : demoFixture;

/** A court booking: from the club's data, or one of the demo club's. */
function isCourtBooking(input: {
  readonly source: ItemSource;
  readonly kind?: ItemKind;
}) {
  return (
    input.source === "court-booking" ||
    (input.source === "demo" && input.kind === "booking")
  );
}

async function isDemo() {
  const session = await getHqSession();
  return session.demo;
}

async function updateDemo(
  change: (store: DemoScheduleStore) => DemoScheduleStore,
) {
  const jar = await cookies();
  const store = parseDemoSchedule(jar.get(DEMO_SCHEDULE_COOKIE)?.value);
  jar.set(DEMO_SCHEDULE_COOKIE, serializeDemoSchedule(change(store)), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24,
  });
}

function localStamp(iso: string, zone: string): string {
  const at = Date.parse(iso);
  const minute = localMinuteOf(at, zone);
  return `${localDateOf(at, zone)}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------ booking */

export interface BookingSlotInput {
  readonly courtId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly personId?: string;
  readonly walkIn?: { readonly name: string; readonly phoneE164?: string };
  readonly paymentIntent: PaymentIntent;
}

function slotFor(input: BookingSlotInput) {
  return {
    courtId: asApiId(input.courtId, scheduleDemoIds.court),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    ...(input.personId && uuidPattern.test(input.personId)
      ? { personId: input.personId }
      : {}),
    ...(input.walkIn
      ? {
          walkIn: {
            name: input.walkIn.name,
            ...(input.walkIn.phoneE164
              ? { phoneE164: input.walkIn.phoneE164 }
              : {}),
          },
        }
      : {}),
  };
}

/** Is the slot free by the shared rule, and what would it cost? */
export async function previewBookingAction(
  input: BookingSlotInput,
): Promise<Result<BookingPreview>> {
  return run(
    "booking-preview",
    async () => {
      const caller = await getServerCaller();
      return caller.operator.schedule.createCourtBookingPreview({
        ...slotFor(input),
        paymentIntent: input.paymentIntent,
      });
    },
    { read: true },
  );
}

export interface CreateItemInput {
  readonly kind: "booking" | "block";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly courtId?: string;
  readonly coachId?: string;
  readonly personId?: string;
  /** The member's name, or the walk-in's name as typed. */
  readonly who?: string;
  /** Bookings: a walk-in (no Duna profile), with a mobile only if given. */
  readonly walkIn?: { readonly name: string; readonly phoneE164?: string };
  readonly paymentIntent?: PaymentIntent;
  /** Bookings: a staff price (money permission), with its reason. */
  readonly priceMinor?: number;
  readonly priceReason?: string;
  /** Bookings: the total the person saw (a different one is refused). */
  readonly expectedTotalMinor?: number;
  readonly currency?: string;
  readonly reason?: string;
  readonly mode?: "blocked" | "maintenance";
  /** Blocks only: repeat weekly on the same weekday until this date. */
  readonly repeatUntil?: string;
  readonly idempotencyKey: string;
}

export async function createItemAction(
  input: CreateItemInput,
): Promise<Result<{ id: string; booking?: BookingCreated }>> {
  return run("create", async () => {
    const demo = await isDemo();
    if (input.kind === "booking") {
      if (!input.courtId) {
        throw new NotAvailableYet("Choose a court for the booking.");
      }
      const caller = await getServerCaller();
      const booking = await caller.operator.schedule.createCourtBooking({
        ...slotFor({
          courtId: input.courtId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          ...(input.personId ? { personId: input.personId } : {}),
          ...(input.walkIn ? { walkIn: input.walkIn } : {}),
          paymentIntent: input.paymentIntent ?? "pay-at-desk",
        }),
        paymentIntent: input.paymentIntent ?? "pay-at-desk",
        currency: input.currency ?? "USD",
        ...(input.priceMinor !== undefined
          ? {
              priceMinor: input.priceMinor,
              priceReason: input.priceReason ?? "",
            }
          : {}),
        ...(input.expectedTotalMinor !== undefined
          ? { expectedTotalMinor: input.expectedTotalMinor }
          : {}),
        idempotencyKey: uuid(input.idempotencyKey),
      });
      if (!demo) return { id: booking.id, booking };
      // Demo: the fixture answered; the calendar keeps it in this browser.
      const id = `demo-${uuid(input.idempotencyKey)}`;
      await updateDemo((store) =>
        store.created.some((entry) => entry.id === id)
          ? store
          : {
              ...store,
              created: [
                ...store.created,
                {
                  id,
                  kind: "booking",
                  title: input.title,
                  ...(input.who ? { who: input.who } : {}),
                  ...(input.personId ? { personId: input.personId } : {}),
                  startsAt: input.startsAt,
                  endsAt: input.endsAt,
                  courtId: input.courtId,
                  ...(booking.totalMinor
                    ? { priceMinor: booking.totalMinor }
                    : {}),
                },
              ],
            },
      );
      return { id, booking: { ...booking, id } };
    }
    if (demo) {
      const id = `demo-${uuid(input.idempotencyKey)}`;
      await updateDemo((store) =>
        store.created.some((entry) => entry.id === id)
          ? store
          : {
              ...store,
              created: [
                ...store.created,
                {
                  id,
                  kind: "block",
                  title: input.title,
                  ...(input.who ? { who: input.who } : {}),
                  startsAt: input.startsAt,
                  endsAt: input.endsAt,
                  ...(input.courtId ? { courtId: input.courtId } : {}),
                  ...(input.coachId ? { coachId: input.coachId } : {}),
                  ...(input.reason ? { reason: input.reason } : {}),
                  ...(input.mode ? { mode: input.mode } : {}),
                },
              ],
            },
      );
      return { id };
    }
    const caller = await getServerCaller();
    const resourceType = input.courtId ? "court" : "coach";
    const resourceId = input.courtId ?? input.coachId;
    if (!resourceId)
      throw new NotAvailableYet("Choose a court or a coach to block.");
    const reason = input.reason?.trim() || input.title;
    if (input.repeatUntil) {
      const start = Date.parse(input.startsAt);
      const date = localDateOf(start, input.timeZone);
      const startMinute = localMinuteOf(start, input.timeZone);
      const length = (Date.parse(input.endsAt) - start) / 60_000;
      const result = await caller.operator.createRecurringCalendarBlocks({
        resourceType,
        resourceId,
        blocks: [
          {
            weekday: weekdayOfDate(date),
            startsAtMinute: startMinute,
            endsAtMinute: Math.min(1_440, startMinute + length),
          },
        ],
        effectiveFrom: date,
        effectiveTo: input.repeatUntil,
        mode: input.mode ?? "blocked",
        reason,
        confirmed: true,
        idempotencyKey: uuid(input.idempotencyKey),
      });
      return { id: result.id };
    }
    const result = await caller.operator.createCalendarBlock({
      resourceType,
      resourceId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      mode: input.mode ?? "blocked",
      reason,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

/* --------------------------------------------------------------- move */

export interface MoveTarget {
  readonly id: string;
  readonly source: ItemSource;
  readonly kind: ItemKind;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId?: string;
}

/** What moving a court booking changes: availability, price, who would be told. */
export async function previewMoveAction(
  input: MoveTarget,
): Promise<Result<MovePreview>> {
  return run(
    "move-preview",
    async () => {
      if (!isCourtBooking(input)) {
        throw new NotAvailableYet("Only court bookings are previewed here.");
      }
      const caller = await getServerCaller();
      return caller.operator.schedule.moveCourtBookingPreview({
        bookingId: asApiId(input.id, scheduleDemoIds.booking),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.courtId
          ? { courtId: asApiId(input.courtId, scheduleDemoIds.court) }
          : {}),
      });
    },
    { read: true },
  );
}

export interface MoveItemInput extends MoveTarget {
  readonly coachId?: string;
  /** Court bookings: the preview the person confirmed. */
  readonly previewToken?: string;
  /** Court bookings: prepare a draft for the people booked (never sent). */
  readonly notify?: boolean;
  /** Court bookings: the person confirmed the new price. */
  readonly confirmedPriceChange?: boolean;
  readonly idempotencyKey: string;
}

export interface MoveResult {
  readonly id: string;
  /** Where it was: moving back there is the Undo. */
  readonly undo?: {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly courtId: string;
  };
  readonly repriced?: boolean;
  readonly toTell?: number;
  readonly draft?: MovePreview["draft"];
  readonly conciergeDraft?: { readonly conversationId: string };
}

export async function moveItemAction(
  input: MoveItemInput,
): Promise<Result<MoveResult>> {
  return run("move", async () => {
    const demo = await isDemo();
    if (isCourtBooking(input)) {
      const caller = await getServerCaller();
      const moved = await caller.operator.schedule.moveCourtBooking({
        bookingId: asApiId(input.id, scheduleDemoIds.booking),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.courtId
          ? { courtId: asApiId(input.courtId, scheduleDemoIds.court) }
          : {}),
        notify: input.notify ?? false,
        ...(input.previewToken ? { previewToken: input.previewToken } : {}),
        ...(input.confirmedPriceChange ? { confirmedPriceChange: true } : {}),
        idempotencyKey: uuid(input.idempotencyKey),
      });
      if (demo) {
        await updateDemo((store) => ({
          ...store,
          moved: {
            ...store.moved,
            [input.id]: {
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              ...(input.courtId ? { courtId: input.courtId } : {}),
            },
          },
        }));
      }
      return {
        id: input.id,
        undo: demo
          ? // The fixture's own slot is not this booking's: the screen keeps
            // its own Undo (where the item was) in demo mode.
            undefined
          : moved.undo,
        repriced: moved.repriced,
        toTell: moved.toTell,
        ...(moved.draft ? { draft: moved.draft } : {}),
        ...(moved.conciergeDraft
          ? { conciergeDraft: moved.conciergeDraft }
          : {}),
      };
    }
    if (demo) {
      await updateDemo((store) => ({
        ...store,
        moved: {
          ...store.moved,
          [input.id]: {
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            ...(input.courtId ? { courtId: input.courtId } : {}),
          },
        },
      }));
      return { id: input.id };
    }
    if (input.source !== "calendar-session") {
      throw new NotAvailableYet(
        "This can't be moved from the schedule. Nothing was moved.",
      );
    }
    const caller = await getServerCaller();
    const key = uuid(input.idempotencyKey);
    const proposal = await caller.operator.proposeCalendarChange({
      sessionId: input.id,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      ...(input.courtId ? { courtId: input.courtId } : {}),
      ...(input.coachId ? { coachPersonId: input.coachId } : {}),
      idempotencyKey: key,
    });
    if (proposal.status === "conflict") {
      throw new NotAvailableYet(
        "That move clashes with something already reserved. Nothing was moved.",
      );
    }
    // The person already confirmed on the calendar (with who is told).
    await caller.operator.confirmCalendarChange({
      proposalId: proposal.id,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    return { id: input.id };
  });
}

export interface CheckInInput {
  readonly itemId: string;
  readonly source: ItemSource;
  /** The roster row (registration, participant or booking). */
  readonly rowId: string;
  readonly checkedIn: boolean;
  readonly idempotencyKey: string;
}

export async function checkInAction(
  input: CheckInInput,
): Promise<Result<{ checkedIn: boolean }>> {
  return run("check-in", async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        checkIns: {
          ...store.checkIns,
          [input.itemId]: {
            ...store.checkIns[input.itemId],
            [input.rowId]: input.checkedIn,
          },
        },
      }));
      return { checkedIn: input.checkedIn };
    }
    const caller = await getServerCaller();
    const status = input.checkedIn ? "attended" : "scheduled";
    if (input.source === "calendar-session") {
      await caller.operator.recordSessionAttendance({
        registrationId: input.rowId,
        status,
        idempotencyKey: uuid(input.idempotencyKey),
      });
    } else if (input.source === "court-booking" || input.source === "pickup") {
      await caller.operator.recordActivityAttendance({
        activityType: input.source === "pickup" ? "pickup" : "court-booking",
        activityId: input.itemId,
        participantId: input.rowId,
        status,
        idempotencyKey: uuid(input.idempotencyKey),
      });
    } else {
      throw new NotAvailableYet(
        "Check-in for this kind of session is on its session page. Nothing was changed.",
      );
    }
    return { checkedIn: input.checkedIn };
  });
}

/* ------------------------------------------------------------- cancel */

export interface CancelTarget {
  readonly id: string;
  readonly source: ItemSource;
  readonly kind: ItemKind;
  readonly refund: RefundChoice;
  readonly cause: CancelCause;
}

/** Exactly who gets what back, by the plan the cancellation runs. */
export async function previewCancelAction(
  input: CancelTarget,
): Promise<Result<CancelPreview>> {
  return run(
    "cancel-preview",
    async () => {
      if (!isCourtBooking(input)) {
        throw new NotAvailableYet("Only court bookings are previewed here.");
      }
      const caller = await getServerCaller();
      return caller.operator.schedule.cancelCourtBookingPreview({
        bookingId: asApiId(input.id, scheduleDemoIds.booking),
        refund: input.refund,
        cause: input.cause,
      });
    },
    { read: true },
  );
}

export interface CancelItemInput {
  readonly id: string;
  readonly source: ItemSource;
  readonly kind?: ItemKind;
  readonly reason: string;
  /** Court bookings: the refund choice and cause the person confirmed. */
  readonly refund?: RefundChoice;
  readonly cause?: CancelCause;
  readonly previewToken?: string;
  /** Court bookings: prepare a draft for the people booked (never sent). */
  readonly notify?: boolean;
  readonly idempotencyKey: string;
}

export interface CancelResult {
  readonly id: string;
  readonly lines?: readonly (CancelPreview["lines"][number] & {
    readonly outcome:
      | "released"
      | "refund-submitted"
      | "refund-failed"
      | "handed-back-recorded"
      | "kept";
  })[];
  readonly totalRefundMinor?: number;
  readonly currency?: string;
  readonly draft?: CancelPreview["draft"];
  readonly conciergeDraft?: { readonly conversationId: string };
}

export async function cancelItemAction(
  input: CancelItemInput,
): Promise<Result<CancelResult>> {
  return run(
    "cancel",
    async () => {
      const demo = await isDemo();
      if (isCourtBooking(input)) {
        const caller = await getServerCaller();
        const cancelled = await caller.operator.schedule.cancelCourtBooking({
          bookingId: asApiId(input.id, scheduleDemoIds.booking),
          reason: input.reason,
          refund: input.refund ?? "by-policy",
          cause: input.cause ?? "player-asked",
          confirmed: true,
          ...(input.previewToken ? { previewToken: input.previewToken } : {}),
          notify: input.notify ?? true,
          idempotencyKey: uuid(input.idempotencyKey),
        });
        if (demo) {
          await updateDemo((store) => ({
            ...store,
            cancelled: [...new Set([...store.cancelled, input.id])],
          }));
        }
        return {
          id: input.id,
          lines: cancelled.lines,
          ...(cancelled.totalRefundMinor !== undefined
            ? { totalRefundMinor: cancelled.totalRefundMinor }
            : {}),
          ...(cancelled.currency ? { currency: cancelled.currency } : {}),
          draft: cancelled.draft,
          ...(cancelled.conciergeDraft
            ? { conciergeDraft: cancelled.conciergeDraft }
            : {}),
        };
      }
      if (demo) {
        await updateDemo((store) => ({
          ...store,
          cancelled: [...new Set([...store.cancelled, input.id])],
        }));
        return { id: input.id };
      }
      if (input.source !== "calendar-session") {
        throw new NotAvailableYet(
          "This can't be cancelled from the schedule. Nothing was cancelled.",
        );
      }
      const caller = await getServerCaller();
      await caller.operator.cancelCalendarSession({
        sessionId: input.id,
        reason: input.reason,
        confirmed: true,
        idempotencyKey: uuid(input.idempotencyKey),
      });
      return { id: input.id };
    },
    { denied: input.refund && input.refund !== "none" ? "money" : "change" },
  );
}

export interface CloseCourtsInput {
  readonly courtIds: readonly string[];
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly reason: string;
  readonly weather: boolean;
  /** Sessions to cancel (the person confirmed each one, with who is told). */
  readonly cancel: readonly {
    readonly id: string;
    readonly source: ItemSource;
  }[];
  readonly idempotencyKey: string;
}

export async function closeCourtsAction(
  input: CloseCourtsInput,
): Promise<Result<{ closed: number; cancelled: number }>> {
  return run("close", async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        created: [
          ...store.created,
          ...input.courtIds
            .filter(
              (courtId) =>
                !store.created.some(
                  (entry) =>
                    entry.id ===
                    `demo-close-${input.idempotencyKey}-${courtId}`,
                ),
            )
            .map((courtId) => ({
              id: `demo-close-${input.idempotencyKey}-${courtId}`,
              kind: "block" as const,
              title: input.weather ? "Weather hold" : "Closed",
              who: input.reason,
              reason: input.reason,
              mode: input.weather ? ("weather" as const) : ("blocked" as const),
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              courtId,
            })),
        ],
        cancelled: [
          ...new Set([
            ...store.cancelled,
            ...input.cancel.map((item) => item.id),
          ]),
        ],
      }));
      return { closed: input.courtIds.length, cancelled: input.cancel.length };
    }
    const caller = await getServerCaller();
    for (const [index, courtId] of input.courtIds.entries()) {
      await caller.operator.blockCourtTime({
        courtId,
        localStartsAt: localStamp(input.startsAt, input.timeZone),
        localEndsAt: localStamp(input.endsAt, input.timeZone),
        reason: input.reason,
        confirmed: true,
        idempotencyKey:
          index === 0 ? uuid(input.idempotencyKey) : crypto.randomUUID(),
      });
    }
    let cancelled = 0;
    for (const item of input.cancel) {
      if (item.source !== "calendar-session") continue;
      await caller.operator.cancelCalendarSession({
        sessionId: item.id,
        reason: input.reason,
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      });
      cancelled += 1;
    }
    return { closed: input.courtIds.length, cancelled };
  });
}

/* ------------------------------------------------------- desk payment */

export interface DeskPaymentInput {
  readonly id: string;
  readonly source: ItemSource;
  readonly kind: ItemKind;
  /** The whole amount due (the API records only the whole amount). */
  readonly amountMinor: number;
  readonly method: DeskMethod;
  readonly note?: string;
  readonly idempotencyKey: string;
}

/**
 * Marks a court booking paid at the desk: no card is charged, no Duna Pay
 * money moves; Money shows the order paid with no processor payment.
 */
export async function markPaidAction(
  input: DeskPaymentInput,
): Promise<Result<{ id: string; amountMinor: number; currency: string }>> {
  return run(
    "desk-payment",
    async () => {
      if (!isCourtBooking(input)) {
        throw new NotAvailableYet(
          "Desk payments are recorded on court bookings. Nothing was changed.",
        );
      }
      const caller = await getServerCaller();
      const recorded = await caller.operator.schedule.recordDeskPayment({
        bookingId: asApiId(input.id, scheduleDemoIds.booking),
        amountMinor: input.amountMinor,
        method: input.method,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        confirmed: true,
        idempotencyKey: uuid(input.idempotencyKey),
      });
      if (await isDemo()) {
        await updateDemo((store) => ({
          ...store,
          paid: [...new Set([...store.paid, input.id])],
        }));
      }
      return {
        id: input.id,
        amountMinor: recorded.amountMinor,
        currency: recorded.currency,
      };
    },
    { denied: "money" },
  );
}

export interface RosterInput {
  readonly itemId: string;
  readonly source: ItemSource;
  readonly op: "add" | "remove";
  /** Add: the member. */
  readonly personId?: string;
  readonly name?: string;
  /** Remove: the roster row (registration). */
  readonly rowId?: string;
  readonly idempotencyKey: string;
}

/** Adds a member to a session, or takes one off; they are told either way. */
export async function rosterAction(
  input: RosterInput,
): Promise<Result<{ id: string }>> {
  return run(`roster-${input.op}`, async () => {
    if (await isDemo()) {
      await updateDemo((store) => {
        const current = store.roster[input.itemId] ?? {
          added: [],
          removed: [],
        };
        const next =
          input.op === "add" && input.personId
            ? {
                ...current,
                added: [
                  ...current.added,
                  {
                    id: `${input.itemId}:${input.personId}`,
                    personId: input.personId,
                    name: input.name ?? "Member",
                  },
                ],
              }
            : { ...current, removed: [...current.removed, input.rowId ?? ""] };
        return { ...store, roster: { ...store.roster, [input.itemId]: next } };
      });
      return { id: input.itemId };
    }
    if (input.source !== "calendar-session") {
      throw new NotAvailableYet(
        "Changing who is on a court booking isn't available from HQ yet. Nothing was changed.",
      );
    }
    const caller = await getServerCaller();
    const result =
      input.op === "add"
        ? await caller.operator.addCalendarParticipant({
            sessionId: input.itemId,
            personId: input.personId ?? "",
            reason: "Added by the club from the schedule.",
            idempotencyKey: uuid(input.idempotencyKey),
          })
        : await caller.operator.removeCalendarParticipant({
            registrationId: input.rowId ?? "",
            reason: "Taken off the session by the club from the schedule.",
            idempotencyKey: uuid(input.idempotencyKey),
          });
    return { id: result.id };
  });
}

export interface EquipmentInput {
  readonly itemId: string;
  readonly op: "add" | "remove";
  readonly inventoryId?: string;
  readonly quantity?: number;
  readonly reservationId?: string;
  readonly idempotencyKey: string;
}

/** Reserves equipment for a session, or releases it. */
export async function equipmentAction(
  input: EquipmentInput,
): Promise<Result<{ id: string }>> {
  return run(`equipment-${input.op}`, async () => {
    if (await isDemo()) {
      throw new NotAvailableYet(
        "Equipment reservations need the club's own data; the demo club has no equipment. Nothing was changed.",
      );
    }
    const caller = await getServerCaller();
    const result =
      input.op === "add"
        ? await caller.operator.addCalendarEquipment({
            sessionId: input.itemId,
            inventoryStockItemId: input.inventoryId ?? "",
            quantity: Math.max(1, input.quantity ?? 1),
            reason: "Reserved from the schedule.",
            idempotencyKey: uuid(input.idempotencyKey),
          })
        : await caller.operator.removeCalendarEquipment({
            reservationId: input.reservationId ?? "",
            reason: "Released from the schedule.",
            idempotencyKey: uuid(input.idempotencyKey),
          });
    return { id: result.id };
  });
}

/**
 * Coaches' availability for the shared rule, read when the person first
 * needs it (creating, moving, "Who is free"), for the dates shown: one call
 * for the whole team (`operator.teamAvailability.range`). A coach the
 * answer leaves out is answered with null: the screen says their conflicts
 * can't be checked instead of guessing.
 */
export async function coachAvailabilityAction(input: {
  readonly from: string;
  readonly to: string;
  readonly staffProfileIds: readonly string[];
}): Promise<Record<string, NonNullable<CoachFacts["availability"]> | null>> {
  const empty = Object.fromEntries(
    input.staffProfileIds.map((id) => [id, null] as const),
  );
  try {
    const caller = await getServerCaller();
    const range = await caller.operator.teamAvailability.range({
      from: input.from,
      to: input.to,
    });
    const loaded: Record<
      string,
      NonNullable<CoachFacts["availability"]> | null
    > = { ...empty };
    for (const member of range.staff) {
      loaded[member.staffProfileId] = {
        schedules: member.schedules.map((schedule) => ({
          id: schedule.id,
          status: schedule.status,
          effectiveFrom: schedule.effectiveFrom,
          ...(schedule.effectiveTo
            ? { effectiveTo: schedule.effectiveTo }
            : {}),
          timezone: schedule.timezone,
          windows: schedule.windows.map((window) => ({
            weekday: window.weekday,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            ...(window.kind ? { kind: window.kind } : {}),
            ...(window.venueId ? { venueId: window.venueId } : {}),
          })),
        })),
        blackouts: member.blackouts.map((row) => ({
          id: row.id,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        })),
        timeOff: member.timeOff.map((row) => ({
          id: row.id,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          status: row.status,
        })),
      };
    }
    return loaded;
  } catch (error) {
    log.warn("hq.schedule.availability_unavailable", {
      code: codeOf(error) ?? "unknown",
    });
    return empty;
  }
}

/* -------------------------------------------------------------- blocks */

/** The demo club's blocks as the fixture's: a closure had a clinic cancelled under it. */
function demoBlockId(id: string) {
  if (uuidPattern.test(id)) return id;
  return id.startsWith("demo-close-")
    ? scheduleDemoBlock.id
    : scheduleDemoIds.weeklyBlock;
}

/** What removing a block does: one-off or weekly, and what was cancelled under it. */
export async function previewRemoveBlockAction(input: {
  readonly id: string;
  readonly date: string;
}): Promise<Result<BlockPreview>> {
  return run(
    "remove-block-preview",
    async () => {
      const demo = await isDemo();
      const caller = await getServerCaller();
      // "all" answers for a one-off and a weekly block alike, and says which.
      return caller.operator.schedule.removeCalendarBlockPreview({
        id: demo ? demoBlockId(input.id) : input.id,
        scope: demo ? "this" : "all",
        ...(demo ? {} : { date: input.date }),
      });
    },
    { read: true },
  );
}

/** Removes a block or a closure (the court opens again for bookings). */
export async function removeBlockAction(input: {
  readonly id: string;
  readonly scope: BlockScope;
  /** Weekly blocks: the date chosen on the calendar. */
  readonly date: string;
  readonly reason: string;
  /** The person acknowledged what stays cancelled under it. */
  readonly acknowledgeCancelled?: boolean;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string; stillCancelled: number }>> {
  return run("remove-block", async () => {
    const demo = await isDemo();
    const caller = await getServerCaller();
    const removed = await caller.operator.schedule.removeCalendarBlock({
      id: demo ? demoBlockId(input.id) : input.id,
      reason: input.reason,
      scope: input.scope,
      ...(input.scope === "this-occurrence" ||
      input.scope === "this-and-following"
        ? { date: input.date }
        : {}),
      ...(input.acknowledgeCancelled ? { acknowledgeCancelled: true } : {}),
      idempotencyKey: uuid(input.idempotencyKey),
    });
    if (demo) {
      await updateDemo((store) => ({
        ...store,
        created: store.created.filter((entry) => entry.id !== input.id),
        cancelled: [...new Set([...store.cancelled, input.id])],
      }));
    }
    return { id: input.id, stillCancelled: removed.stillCancelled };
  });
}
