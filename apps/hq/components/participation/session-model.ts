/**
 * A group session as HQ shows it (participation.md §7.1, PART-7): one view
 * model from either the offering's occurrences or the at-risk list, with its
 * state rendered by the SAME shared display function the apps use
 * (`participationDisplay` + `renderParticipationCopy`). Pure, so it is shared
 * by offerings and, later, event sessions and divisions.
 */
import type { operatorCatalogSessionOccurrenceSchema } from "@duna/api";
import {
  formatParticipationTime,
  participationDisplay,
  readParticipationRuleV2,
  renderParticipationCopy,
  resolveParticipationRuleV2,
  type ParticipationDecisionOutcome,
  type ParticipationDisplay,
  type ParticipationState,
  type ResolvedParticipationRule,
} from "@duna/core";
import type { z } from "zod";

export type OperatorOccurrence = z.infer<
  typeof operatorCatalogSessionOccurrenceSchema
>;

export type SessionState = ParticipationState | "open";

export interface SessionBooking {
  readonly id: string;
  readonly personId: string;
  readonly name: string;
  /** Places this booking holds (a parent booking twins holds 2). */
  readonly quantity: number;
  readonly method: "credit" | "card" | "cash" | "other";
  readonly reservedCredits: number;
  readonly attendance?: "attended" | "absent";
}

export interface SessionView {
  readonly id: string;
  readonly subjectType: "catalog-session-occurrence";
  readonly catalogItemId?: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly coachNames: readonly string[];
  readonly booked: number;
  readonly capacity: number;
  readonly minimum: number;
  readonly waiting: number;
  readonly lockAt?: string;
  /** The shared display model; every word below comes from it. */
  readonly display: ParticipationDisplay;
  readonly state: SessionState;
  /** "Needs 2 more", "Confirmed · 5 players". */
  readonly status: string;
  /** "Confirms Thu 6:00 PM if 2 more join". */
  readonly line?: string;
  /** "At risk · needs 2 by Thu 6:00 PM", "Running with 2 of 4". */
  readonly staff: string;
  /** "Thu 6:00 PM" (the venue's zone, day name within 6 days). */
  readonly startLabel: string;
  readonly lockLabel?: string;
  /** Present only for people who may see money. */
  readonly atStakeCredits?: number;
  readonly atStakeMinor?: number;
  /** Null when the list did not include the roster (the at-risk list). */
  readonly bookings: readonly SessionBooking[] | null;
  readonly minimumPolicy: "cancel" | "run";
}

/** The server's display state as the outcome the shared display derives it from. */
export function outcomeForState(
  state: string | undefined,
): ParticipationDecisionOutcome | undefined {
  switch (state) {
    case "confirmed":
    case "done":
    case "settled":
      return "minimum-met";
    case "running-small":
      return "run-under-minimum";
    case "cancelled-low":
      return "cancel-under-minimum";
    case "cancelled-club":
      return "cancelled-by-club";
    default:
      return undefined;
  }
}

function method(value: string | undefined): SessionBooking["method"] {
  if (value === "credit" || value === "credits") return "credit";
  if (value === "card") return "card";
  if (value === "cash") return "cash";
  return "other";
}

function sessionRule(input: {
  readonly minimum: number;
  readonly policy: "cancel" | "run";
  readonly capacity: number;
  readonly waitlist: boolean;
  readonly rule?: unknown;
}): ResolvedParticipationRule | undefined {
  const stored = readParticipationRuleV2(input.rule);
  if (stored) {
    return resolveParticipationRuleV2(stored, { capacity: input.capacity });
  }
  if (input.minimum <= 1) return undefined;
  return resolveParticipationRuleV2(
    {
      version: 2,
      unit: "player",
      minParticipants: input.minimum,
      minimumPolicy: input.policy,
      waitlist: input.waitlist,
      tiers: [],
    },
    { capacity: input.capacity },
  );
}

function view(input: {
  readonly id: string;
  readonly catalogItemId?: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly coachNames: readonly string[];
  readonly booked: number;
  readonly held: number;
  readonly capacity: number;
  readonly minimum: number;
  readonly policy: "cancel" | "run";
  readonly waiting: number;
  readonly lockAt?: string;
  readonly state?: string;
  readonly rule?: unknown;
  readonly atStakeCredits?: number;
  readonly atStakeMinor?: number;
  readonly bookings: readonly SessionBooking[] | null;
  readonly now: Date;
  readonly clubName?: string;
}): SessionView {
  const rule = sessionRule({
    minimum: input.minimum,
    policy: input.policy,
    capacity: input.capacity,
    waitlist: input.waiting > 0,
    rule: input.rule,
  });
  const outcome = outcomeForState(input.state);
  const display = participationDisplay({
    rule,
    title: input.title,
    capacity: input.capacity,
    booked: input.booked,
    held: input.held,
    waiting: input.waiting,
    outcome,
    decidedGroupSize: outcome ? input.booked : undefined,
    lockAt: input.lockAt ? new Date(input.lockAt) : undefined,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    now: input.now,
    timeZone: input.timeZone,
    clubName: input.clubName,
    attendanceClosed: input.state === "settled",
    payment: { method: "credit" },
  });
  const start = formatParticipationTime({
    at: new Date(input.startsAt),
    now: input.now,
    timeZone: input.timeZone,
  });
  return {
    id: input.id,
    subjectType: "catalog-session-occurrence",
    ...(input.catalogItemId ? { catalogItemId: input.catalogItemId } : {}),
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timeZone: input.timeZone,
    coachNames: input.coachNames,
    booked: input.booked,
    capacity: input.capacity,
    minimum: input.minimum,
    waiting: input.waiting,
    ...(input.lockAt ? { lockAt: input.lockAt } : {}),
    display,
    state: display.state,
    status: renderParticipationCopy(display.status),
    ...(display.line ? { line: renderParticipationCopy(display.line) } : {}),
    staff: renderParticipationCopy(display.staff),
    startLabel: start.label,
    ...(display.lock ? { lockLabel: display.lock.label } : {}),
    ...(input.atStakeCredits !== undefined
      ? { atStakeCredits: input.atStakeCredits }
      : {}),
    ...(input.atStakeMinor !== undefined
      ? { atStakeMinor: input.atStakeMinor }
      : {}),
    bookings: input.bookings,
    minimumPolicy: input.policy,
  };
}

/** One occurrence of an offering (`operator.catalogSessionOccurrences`). */
export function sessionFromOccurrence(
  occurrence: OperatorOccurrence,
  context: {
    readonly now: Date;
    readonly clubName?: string;
    readonly coachNames?: readonly string[];
    /** The offering's rule (with its ladder), when the page has it. */
    readonly rule?: unknown;
  },
): SessionView {
  const participation = occurrence.participation;
  const bookings = occurrence.bookings
    .filter((booking) => booking.confirmed)
    .map((booking): SessionBooking => ({
      id: booking.fulfillmentId,
      personId: booking.personId,
      name: booking.displayName,
      quantity: booking.quantity,
      method: method(booking.paymentMethod),
      reservedCredits: booking.reservedCredits,
      ...(booking.attendance
        ? {
            attendance:
              booking.attendance === "attended" ? "attended" : "absent",
          }
        : {}),
    }));
  const cancelled = occurrence.status === "cancelled";
  return view({
    id: occurrence.id,
    catalogItemId: occurrence.catalogItemId,
    title: occurrence.title,
    startsAt: occurrence.startsAt,
    endsAt: occurrence.endsAt,
    timeZone: occurrence.timezone,
    coachNames: context.coachNames ?? [],
    booked: participation?.bookedCount ?? occurrence.confirmedCount,
    held: participation?.heldCount ?? 0,
    capacity: occurrence.capacity,
    minimum: participation?.minParticipants ?? 1,
    policy: participation?.minimumPolicy === "cancel" ? "cancel" : "run",
    waiting: participation?.waitlistCount ?? 0,
    lockAt: participation?.lockAt ?? participation?.decisionAt,
    state:
      participation?.displayState ??
      (cancelled
        ? "cancelled-club"
        : participation?.status === "cancelled-under-minimum"
          ? "cancelled-low"
          : participation?.status === "running-under-minimum"
            ? "running-small"
            : participation?.status === "confirmed"
              ? "confirmed"
              : undefined),
    rule: context.rule,
    atStakeCredits: participation?.atStakeCredits,
    atStakeMinor: participation?.atStakeMinor,
    bookings,
    now: context.now,
    clubName: context.clubName,
  });
}

export interface AtRiskRow {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly catalogItemId?: string;
  readonly title: string;
  readonly startsAt: string;
  readonly timezone: string;
  readonly coachNames: readonly string[];
  readonly booked: number;
  readonly min: number;
  readonly capacity: number;
  readonly lockAt: string;
  readonly displayState: string;
  readonly atStakeMinor?: number;
  readonly atStakeCredits?: number;
}

/** One row of `operator.participation.atRisk` (no roster; the sheet loads it). */
export function sessionFromAtRisk(
  row: AtRiskRow,
  context: { readonly now: Date; readonly clubName?: string },
): SessionView {
  // The at-risk list carries no end time; a session's end only matters once
  // it started, which an at-risk session has not.
  const endsAt = new Date(
    new Date(row.startsAt).getTime() + 90 * 60_000,
  ).toISOString();
  return view({
    id: row.subjectId,
    ...(row.catalogItemId ? { catalogItemId: row.catalogItemId } : {}),
    title: row.title,
    startsAt: row.startsAt,
    endsAt,
    timeZone: row.timezone,
    coachNames: row.coachNames,
    booked: row.booked,
    held: 0,
    capacity: row.capacity,
    minimum: row.min,
    policy: "cancel",
    waiting: 0,
    lockAt: row.lockAt,
    state: row.displayState,
    atStakeCredits: row.atStakeCredits,
    atStakeMinor: row.atStakeMinor,
    bookings: null,
    now: context.now,
    clubName: context.clubName,
  });
}

/** Filters on a sessions list (participation.md §7.1, Sessions tab). */
export type SessionFilter =
  "all" | "at-risk" | "full" | "confirmed" | "cancelled";

export function sessionMatches(session: SessionView, filter: SessionFilter) {
  switch (filter) {
    case "all":
      return true;
    case "at-risk":
      return session.state === "needs-players";
    case "full":
      return session.state === "full";
    case "confirmed":
      return (
        session.state === "confirmed" ||
        session.state === "running-small" ||
        session.state === "minimum-reached"
      );
    case "cancelled":
      return (
        session.state === "cancelled-low" || session.state === "cancelled-club"
      );
  }
}

/** Whether the club can still act on a session before it is decided. */
export function sessionIsOpen(session: SessionView): boolean {
  return (
    session.state === "needs-players" ||
    session.state === "minimum-reached" ||
    session.state === "full" ||
    session.state === "open"
  );
}

/** The decision time has passed (or the session started). */
export function sessionHasStarted(session: SessionView, now: Date): boolean {
  return new Date(session.startsAt).getTime() <= now.getTime();
}

/** Attendance is open from the start until 24 hours after the end (decision 2). */
export function attendanceOpen(session: SessionView, now: Date): boolean {
  if (session.state === "cancelled-low" || session.state === "cancelled-club")
    return false;
  if (session.state === "settled") return false;
  return new Date(session.startsAt).getTime() <= now.getTime();
}

export interface RefundLine {
  readonly bookingId: string;
  readonly name: string;
  /** "9 credits back to the wallet", "card refund in full", "reservation released". */
  readonly what: string;
}

/**
 * Who gets what back if the club cancels (decision: full refunds, the
 * Service Fee included). Credits are exact (what each booking reserved);
 * card amounts per person are not on the roster, so the total at stake is
 * shown instead, and only to people who may see money.
 */
export function cancelRefunds(session: SessionView): {
  readonly lines: readonly RefundLine[];
  readonly people: number;
  readonly credits: number;
  readonly cardRefunds: number;
} {
  const bookings = session.bookings ?? [];
  const lines = bookings.map((booking): RefundLine => {
    const places =
      booking.quantity === 1 ? "" : ` (${booking.quantity} places)`;
    const what =
      booking.method === "credit"
        ? `${booking.reservedCredits} credit${booking.reservedCredits === 1 ? "" : "s"} back to their wallet${places}`
        : booking.method === "card"
          ? `A full refund to their card, service fee included${places}`
          : `Their reservation is released${places}`;
    return { bookingId: booking.id, name: booking.name, what };
  });
  return {
    lines,
    people: bookings.length,
    credits: bookings
      .filter((booking) => booking.method === "credit")
      .reduce((total, booking) => total + booking.reservedCredits, 0),
    cardRefunds: bookings.filter((booking) => booking.method === "card").length,
  };
}

export interface MergeOption {
  readonly into: SessionView;
  /** Null when the merge is allowed; the reason in words when it is not. */
  readonly refusal: string | null;
  /** The people who move. */
  readonly moving: readonly SessionBooking[];
}

/** What a place costs in a session, in credits: the most any booking there reserved per place. */
function reservePerPlace(session: SessionView): number | undefined {
  const prices = (session.bookings ?? [])
    .filter((booking) => booking.method === "credit" && booking.quantity > 0)
    .map((booking) => booking.reservedCredits / booking.quantity);
  return prices.length === 0 ? undefined : Math.max(...prices);
}

/**
 * Sessions of the same offering this one could merge into, each with the
 * reason it is refused, if it is: no room, already decided, or a merge that
 * would make anyone pay more (participation.md §6: price never up).
 */
export function mergeOptions(
  from: SessionView,
  candidates: readonly SessionView[],
  now: Date,
): readonly MergeOption[] {
  const moving = from.bookings ?? [];
  const fromReserve = reservePerPlace(from);
  return candidates
    .filter(
      (candidate) =>
        candidate.id !== from.id &&
        candidate.catalogItemId === from.catalogItemId &&
        !sessionHasStarted(candidate, now),
    )
    .map((into): MergeOption => {
      let refusal: string | null = null;
      const intoReserve = reservePerPlace(into);
      if (!sessionIsOpen(into)) {
        refusal = "This session is already decided.";
      } else if (into.capacity - into.booked < from.booked) {
        refusal = `Only ${Math.max(0, into.capacity - into.booked)} places are left there; ${from.booked} people would move.`;
      } else if (
        fromReserve !== undefined &&
        intoReserve !== undefined &&
        intoReserve > fromReserve
      ) {
        refusal = `A place there costs ${intoReserve} credits, more than the ${fromReserve} these players paid. A merge never makes anyone pay more.`;
      }
      return { into, refusal, moving };
    });
}

/** The roster's places, counting group bookings by quantity. */
export function placesBooked(bookings: readonly SessionBooking[]): number {
  return bookings.reduce((total, booking) => total + booking.quantity, 0);
}
