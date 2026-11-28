"use server";

import { log } from "@duna/observability";
import { localDateOf, localMinuteOf, weekdayOfDate } from "@duna/scheduling";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { MoneyActionResult } from "@/components/money/money-action-result";
import { isNotConfiguredAnswer } from "@/components/money/money-data";
import {
  DEMO_SCHEDULE_COOKIE,
  parseDemoSchedule,
  serializeDemoSchedule,
  type DemoScheduleStore,
} from "@/components/schedule/schedule-demo";
import {
  teamAvailabilityToInputs,
  type CoachFacts,
  type ItemKind,
  type ItemSource,
} from "@/components/schedule/schedule-model";
import type { ScheduleCapability } from "@/components/schedule/schedule-capabilities";
import { getHqSession } from "@/components/shell/hq-session";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";

/**
 * Schedule's changes (H-SCHEDULE). Each is a person's confirmed action from
 * the calendar: the screen asks first (a move that affects booked people, a
 * cancellation, a closure), then calls one of these with the idempotency
 * key the confirming control made (reused on retry). They answer a result
 * instead of throwing, so the screen can say what happened and give the
 * reference. In demo mode (no Duna Database) changes are kept in a cookie
 * in the person's own browser.
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

async function run<T>(
  action: string,
  perform: () => Promise<T>,
): Promise<Result<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    revalidatePath("/schedule");
    log.info("hq.schedule.action_succeeded", { action });
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
          "Your role can't change the schedule. Nothing was changed; the club's owner or front desk can.",
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
    return {
      ok: false,
      code: "failed",
      message:
        code && plainCodes.has(code) && error instanceof Error && error.message
          ? `${error.message} Nothing was changed.`
          : "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

/** A change the API cannot make yet (listed under "Needs API"). */
class NotAvailableYet extends Error {}

/**
 * A change whose procedure has not landed (schedule-capabilities.ts). The
 * screen does not offer it while its switch is off; this answer is for a
 * stale page. The guard test fails if a switch is on while this remains.
 */
function needsApi(capability: ScheduleCapability, message: string): never {
  throw new NotAvailableYet(message);
}

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();

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

export interface CreateItemInput {
  readonly kind: Exclude<ItemKind, "event" | "session">;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly courtId?: string;
  readonly coachId?: string;
  readonly personId?: string;
  /** The person's name, or a walk-in's name as typed. */
  readonly who?: string;
  readonly priceMinor?: number;
  readonly reason?: string;
  readonly mode?: "blocked" | "maintenance";
  /** Blocks only: repeat weekly on the same weekday until this date. */
  readonly repeatUntil?: string;
  readonly idempotencyKey: string;
}

export async function createItemAction(
  input: CreateItemInput,
): Promise<Result<{ id: string }>> {
  return run("create", async () => {
    const id = `demo-${uuid(input.idempotencyKey)}`;
    if (await isDemo()) {
      await updateDemo((store) =>
        store.created.some((entry) => entry.id === id)
          ? store
          : {
              ...store,
              created: [
                ...store.created,
                {
                  id,
                  kind: input.kind,
                  title: input.title,
                  ...(input.who ? { who: input.who } : {}),
                  ...(input.personId ? { personId: input.personId } : {}),
                  startsAt: input.startsAt,
                  endsAt: input.endsAt,
                  ...(input.courtId ? { courtId: input.courtId } : {}),
                  ...(input.coachId ? { coachId: input.coachId } : {}),
                  ...(input.priceMinor ? { priceMinor: input.priceMinor } : {}),
                  ...(input.reason ? { reason: input.reason } : {}),
                  ...(input.mode ? { mode: input.mode } : {}),
                },
              ],
            },
      );
      return { id };
    }
    if (input.kind !== "block") {
      needsApi(
        "createBooking",
        "Booking a court or a lesson from HQ isn't available yet. Nothing was booked; players can still book in the app.",
      );
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

export interface MoveItemInput {
  readonly id: string;
  readonly source: ItemSource;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId?: string;
  readonly coachId?: string;
  readonly idempotencyKey: string;
}

export async function moveItemAction(
  input: MoveItemInput,
): Promise<Result<{ id: string }>> {
  return run("move", async () => {
    if (await isDemo()) {
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
      needsApi(
        "moveBooking",
        "Moving a court booking from HQ isn't available yet. Nothing was moved.",
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

export interface CancelItemInput {
  readonly id: string;
  readonly source: ItemSource;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export async function cancelItemAction(
  input: CancelItemInput,
): Promise<Result<{ id: string }>> {
  return run("cancel", async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        cancelled: [...new Set([...store.cancelled, input.id])],
      }));
      return { id: input.id };
    }
    if (input.source !== "calendar-session") {
      needsApi(
        "cancelBooking",
        "Cancelling a court booking from HQ isn't available yet. Nothing was cancelled.",
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
  });
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

export async function markPaidAction(input: {
  readonly id: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("mark-paid", async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        paid: [...new Set([...store.paid, input.id])],
      }));
      return { id: input.id };
    }
    needsApi(
      "deskPayment",
      "Recording a payment taken at the desk isn't available from HQ yet. Nothing was changed.",
    );
  });
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
 * needs it (creating, moving, "Who is free"). A coach whose availability
 * cannot be read is answered with null: the screen says their conflicts
 * can't be checked instead of guessing.
 */
export async function coachAvailabilityAction(
  staffProfileIds: readonly string[],
): Promise<Record<string, NonNullable<CoachFacts["availability"]> | null>> {
  const caller = await getServerCaller();
  const entries = await Promise.all(
    staffProfileIds.slice(0, 40).map(async (staffProfileId) => {
      try {
        const page = await caller.operator.teamAvailability.staff({
          staffProfileId,
        });
        return [staffProfileId, teamAvailabilityToInputs(page)] as const;
      } catch {
        return [staffProfileId, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Removes a block or a closure (the court opens again for bookings). */
export async function removeBlockAction(input: {
  readonly id: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("remove-block", async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        created: store.created.filter((entry) => entry.id !== input.id),
        cancelled: [...new Set([...store.cancelled, input.id])],
      }));
      return { id: input.id };
    }
    return needsApi(
      "removeBlock",
      "Removing a block from HQ isn't available yet. Nothing was changed.",
    );
  });
}
