/**
 * The session a coach runs at the court (M-R2, PART-12), as one model from
 * either source the Pro runtime has:
 *
 * - a calendar session (`operator.workspace` → `calendar.entries`, the
 *   `sessions` table: registrations, check-in, equipment, arrivals);
 * - a group session (`operator.catalogSessionOccurrences`: bookings, the
 *   group rule, the lock, attendance), often first seen in
 *   `operator.participation.atRisk`.
 *
 * Every word about the group's state comes from `@duna/core` participation
 * (`participationDisplay` → tokens → `renderParticipationCopy`), so Pro says
 * what HQ and the Player say. Pure and unit-tested (`session-model.test.ts`).
 */
import {
  participationDisplay,
  renderParticipationCopy,
  type ParticipationDecisionOutcome,
  type ParticipationDisplay,
  type ParticipationState,
  type ResolvedParticipationRule,
} from "@duna/core";
import { formatTime, formatTimeRange } from "@duna/tideline-core";
import type { AttendanceStatus, AttendanceTarget } from "./attendance-queue";
import {
  cancelPlanFor,
  entryKindFromSource,
  type CourtBookingCapability,
  type SessionEntryKind,
} from "./cancel-plan";

/** Who the screen is for: a coach, or a director (owner, admin, manager). */
export type SessionAudience = "coach" | "owner";

/** A calendar entry (`operator.workspace` → `calendar.entries`). */
export interface CalendarSessionInput {
  readonly id: string;
  readonly sourceType: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone?: string;
  readonly status: string;
  readonly kind?: string;
  readonly venueId?: string;
  readonly venueName?: string;
  readonly courtId?: string;
  readonly courtName?: string;
  readonly coachName?: string;
  readonly participantCount: number;
  readonly capacity: number;
  readonly attendees: readonly {
    readonly registrationId?: string;
    readonly personId?: string;
    readonly displayName: string;
    readonly isMinor?: boolean;
    readonly status: string;
    readonly attendanceStatus?: string;
  }[];
  readonly equipment?: readonly {
    readonly reservationId: string;
    readonly label: string;
    readonly quantity: number;
  }[];
}

/** A group session (`operator.catalogSessionOccurrences`). */
export interface OccurrenceInput {
  readonly id: string;
  readonly catalogItemId?: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly status: "scheduled" | "cancelled" | "complete";
  readonly capacity: number;
  readonly confirmedCount: number;
  readonly participation?: {
    readonly bookedCount: number;
    readonly minParticipants: number;
    readonly minimumPolicy?: "cancel" | "run";
    readonly decisionAt: string;
    readonly lockAt?: string;
    readonly displayState?: ParticipationState;
    readonly waitlistCount?: number;
    readonly heldCount?: number;
    readonly atStakeCredits?: number;
    readonly atStakeMinor?: number;
  };
  readonly bookings: readonly {
    readonly fulfillmentId: string;
    readonly personId: string;
    readonly displayName: string;
    readonly payerPersonId: string;
    readonly quantity: number;
    readonly paymentMethod?: string;
    readonly confirmed: boolean;
    readonly reservedCredits: number;
    readonly settledCredits?: number;
    readonly returnedCredits?: number;
    readonly attendance?: "attended" | "no-show";
  }[];
}

/** A session under its minimum (`operator.participation.atRisk`). */
export interface AtRiskSessionInput {
  readonly subjectType?: string;
  readonly subjectId: string;
  readonly catalogItemId?: string;
  readonly title: string;
  readonly startsAt: string;
  readonly timezone?: string;
  readonly coachNames?: readonly string[];
  readonly booked: number;
  readonly min: number;
  readonly capacity: number;
  readonly lockAt: string;
  readonly displayState: string;
  readonly atStakeCredits?: number;
  readonly atStakeMinor?: number;
}

export interface SessionPerson {
  readonly key: string;
  /** What attendance is recorded against; null when there is nothing to mark. */
  readonly bookingId: string | null;
  readonly personId?: string;
  readonly displayName: string;
  readonly junior: boolean;
  /** "Junior · their guardian gets updates" (never health or medical details). */
  readonly guardianNote: string | null;
  /** "Paid", "Reserved", "Not paid yet"; amounts only for money roles. */
  readonly payment: string | null;
  readonly attendance: "attended" | "absent" | null;
  /** On the roster (not cancelled, refunded or waitlisted). */
  readonly active: boolean;
  readonly waitlisted: boolean;
  readonly places: number;
}

export interface SessionGroup {
  readonly minimum: number;
  readonly policy: "cancel" | "run";
  readonly lockAt: number;
  readonly displayState?: ParticipationState;
  readonly booked: number;
  readonly held: number;
  readonly waiting: number;
}

export interface SessionDetail {
  readonly id: string;
  readonly source: "calendar" | "occurrence";
  /** What the entry is (a session, a player's court booking, open play…). */
  readonly entryKind: SessionEntryKind;
  /** The group-session subject the participation procedures take. */
  readonly subject: {
    readonly subjectType: "catalog-session-occurrence";
    readonly subjectId: string;
  } | null;
  readonly attendanceTarget: AttendanceTarget | null;
  readonly title: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly timeZone: string;
  readonly kind?: string;
  readonly venueId?: string;
  readonly venueName?: string;
  readonly courtId?: string;
  readonly courtName?: string;
  readonly coachName?: string;
  readonly capacity: number;
  readonly cancelled: boolean;
  readonly group: SessionGroup | null;
  readonly people: readonly SessionPerson[];
  readonly equipment: readonly {
    readonly reservationId: string;
    readonly label: string;
    readonly quantity: number;
  }[];
  /** Group messaging key ("event:…"), when the session has a group thread. */
  readonly audienceKey: string | null;
  /** Duna returned money for this viewer (they hold `payments:read`). */
  readonly moneyVisible: boolean;
  readonly atStakeCredits?: number;
}

const ACTIVE_REGISTRATION = new Set([
  "organizer",
  "accepted",
  "paid",
  "pending",
  "confirmed",
  "checked-in",
  "payment-pending",
  "invited",
]);

function credits(count: number): string {
  return `${count} credit${count === 1 ? "" : "s"}`;
}

function registrationAttendance(
  status: string,
  attendanceStatus: string | undefined,
): "attended" | "absent" | null {
  if (attendanceStatus === "attended" || status === "checked-in")
    return "attended";
  if (attendanceStatus === "no-show") return "absent";
  return null;
}

const GUARDIAN_NOTE = "Junior · their guardian gets updates";

export function sessionFromCalendar(
  entry: CalendarSessionInput,
  fallbackTimeZone: string,
): SessionDetail {
  const people = entry.attendees.map((attendee, index): SessionPerson => {
    const waitlisted = attendee.status === "waitlisted";
    return {
      key: attendee.registrationId ?? `${attendee.displayName}:${index}`,
      bookingId: attendee.registrationId ?? null,
      ...(attendee.personId ? { personId: attendee.personId } : {}),
      displayName: attendee.displayName,
      junior: Boolean(attendee.isMinor),
      guardianNote: attendee.isMinor ? GUARDIAN_NOTE : null,
      payment:
        attendee.status === "paid"
          ? "Paid"
          : attendee.status === "payment-pending"
            ? "Not paid yet"
            : null,
      attendance: registrationAttendance(
        attendee.status,
        attendee.attendanceStatus,
      ),
      active: ACTIVE_REGISTRATION.has(attendee.status),
      waitlisted,
      places: 1,
    };
  });
  return {
    id: entry.id,
    source: "calendar",
    entryKind: entryKindFromSource(entry.sourceType),
    subject: null,
    attendanceTarget: "registration",
    // The workspace labels bookings "… · court booking"; the screen says it.
    title: entry.title.replace(/ · court booking$/, ""),
    startsAt: Date.parse(entry.startsAt),
    endsAt: Date.parse(entry.endsAt),
    timeZone: entry.timezone ?? fallbackTimeZone,
    ...(entry.kind ? { kind: entry.kind } : {}),
    ...(entry.venueId ? { venueId: entry.venueId } : {}),
    ...(entry.venueName ? { venueName: entry.venueName } : {}),
    ...(entry.courtId ? { courtId: entry.courtId } : {}),
    ...(entry.courtName ? { courtName: entry.courtName } : {}),
    ...(entry.coachName ? { coachName: entry.coachName } : {}),
    capacity: entry.capacity,
    cancelled: entry.status === "cancelled",
    group: null,
    people,
    equipment: entry.equipment ?? [],
    audienceKey:
      entry.sourceType === "booking"
        ? `rental:${entry.id}`
        : `event:${entry.id}`,
    moneyVisible: false,
  };
}

export function sessionFromOccurrence(
  occurrence: OccurrenceInput,
  extras: {
    readonly coachName?: string;
    readonly venueId?: string;
    readonly venueName?: string;
    readonly courtName?: string;
  } = {},
): SessionDetail {
  const participation = occurrence.participation;
  const moneyVisible =
    participation?.atStakeCredits !== undefined ||
    participation?.atStakeMinor !== undefined;
  const people = occurrence.bookings.map((booking): SessionPerson => {
    let payment: string;
    if (!booking.confirmed) payment = "Not paid yet";
    else if (booking.settledCredits !== undefined)
      payment = moneyVisible
        ? `Paid ${credits(booking.settledCredits)}`
        : "Paid";
    else if (booking.reservedCredits > 0)
      payment = moneyVisible
        ? `Reserved ${credits(booking.reservedCredits)}`
        : "Reserved";
    else payment = "Paid";
    return {
      key: booking.fulfillmentId,
      bookingId: booking.fulfillmentId,
      personId: booking.personId,
      displayName:
        booking.quantity > 1
          ? `${booking.displayName} + ${booking.quantity - 1}`
          : booking.displayName,
      // Needs API: occurrence bookings do not say whether the player is a junior.
      junior: false,
      guardianNote: null,
      payment,
      attendance:
        booking.attendance === "attended"
          ? "attended"
          : booking.attendance === "no-show"
            ? "absent"
            : null,
      active: true,
      waitlisted: false,
      places: booking.quantity,
    };
  });
  return {
    id: occurrence.id,
    source: "occurrence",
    entryKind: "group-occurrence",
    subject: participation
      ? { subjectType: "catalog-session-occurrence", subjectId: occurrence.id }
      : null,
    attendanceTarget: "participation",
    title: occurrence.title,
    startsAt: Date.parse(occurrence.startsAt),
    endsAt: Date.parse(occurrence.endsAt),
    timeZone: occurrence.timezone,
    ...(extras.venueId ? { venueId: extras.venueId } : {}),
    ...(extras.venueName ? { venueName: extras.venueName } : {}),
    ...(extras.courtName ? { courtName: extras.courtName } : {}),
    ...(extras.coachName ? { coachName: extras.coachName } : {}),
    capacity: occurrence.capacity,
    cancelled: occurrence.status === "cancelled",
    group: participation
      ? {
          minimum: participation.minParticipants,
          policy: participation.minimumPolicy ?? "cancel",
          lockAt: Date.parse(participation.lockAt ?? participation.decisionAt),
          ...(participation.displayState
            ? { displayState: participation.displayState }
            : {}),
          booked: participation.bookedCount,
          held: participation.heldCount ?? 0,
          waiting: participation.waitlistCount ?? 0,
        }
      : null,
    people,
    equipment: [],
    audienceKey: `event:${occurrence.id}`,
    moneyVisible,
    ...(participation?.atStakeCredits !== undefined
      ? { atStakeCredits: participation.atStakeCredits }
      : {}),
  };
}

/**
 * Adds what the at-risk list knows to a session (preview, or a calendar
 * session that is also a group session): the minimum, the lock, the state.
 */
export function withAtRisk(
  detail: SessionDetail,
  risk: AtRiskSessionInput | undefined,
): SessionDetail {
  if (!risk || detail.group) return detail;
  return {
    ...detail,
    subject: {
      subjectType: "catalog-session-occurrence",
      subjectId: risk.subjectId,
    },
    group: {
      minimum: risk.min,
      policy: "cancel",
      lockAt: Date.parse(risk.lockAt),
      ...(isParticipationState(risk.displayState)
        ? { displayState: risk.displayState }
        : {}),
      booked: risk.booked,
      held: 0,
      waiting: 0,
    },
    ...(detail.coachName || !risk.coachNames?.length
      ? {}
      : { coachName: risk.coachNames.join(", ") }),
    moneyVisible:
      detail.moneyVisible ||
      risk.atStakeCredits !== undefined ||
      risk.atStakeMinor !== undefined,
    ...(risk.atStakeCredits !== undefined
      ? { atStakeCredits: risk.atStakeCredits }
      : {}),
  };
}

/** A session known only from the at-risk list (no roster loaded yet). */
export function sessionFromAtRisk(
  risk: AtRiskSessionInput,
  fallbackTimeZone = "UTC",
): SessionDetail {
  const startsAt = Date.parse(risk.startsAt);
  return withAtRisk(
    {
      id: risk.subjectId,
      source: "occurrence",
      entryKind: "group-occurrence",
      subject: null,
      attendanceTarget: "participation",
      title: risk.title,
      startsAt,
      // The list carries no end; a session is at least an hour.
      endsAt: startsAt + 60 * 60_000,
      timeZone: risk.timezone ?? fallbackTimeZone,
      capacity: risk.capacity,
      cancelled: false,
      group: null,
      people: [],
      equipment: [],
      audienceKey: `event:${risk.subjectId}`,
      moneyVisible: false,
    },
    risk,
  );
}

const STATES: readonly string[] = [
  "needs-players",
  "minimum-reached",
  "full",
  "confirmed",
  "running-small",
  "cancelled-low",
  "cancelled-club",
  "done",
  "settled",
];

function isParticipationState(value: string): value is ParticipationState {
  return STATES.includes(value);
}

function outcomeFor(
  state: ParticipationState | undefined,
): ParticipationDecisionOutcome | null {
  switch (state) {
    case "confirmed":
      return "minimum-met";
    case "running-small":
      return "run-under-minimum";
    case "cancelled-low":
      return "cancel-under-minimum";
    case "cancelled-club":
      return "cancelled-by-club";
    default:
      return null;
  }
}

/** Places on the roster (a group booking counts each place). */
export function bookedPlaces(detail: SessionDetail): number {
  if (detail.group) return detail.group.booked;
  return detail.people
    .filter((person) => person.active)
    .reduce((sum, person) => sum + person.places, 0);
}

/**
 * The shared display model for this session: group state, lock and the
 * words, from `@duna/core`. Sessions without a group rule show capacity
 * only ("3 spots left").
 */
export function sessionDisplay(
  detail: SessionDetail,
  now: number,
  viewerTimeZone?: string,
): ParticipationDisplay {
  const group = detail.group;
  const booked = bookedPlaces(detail);
  const capacity = Math.max(1, detail.capacity, booked);
  const rule: ResolvedParticipationRule | undefined = group
    ? {
        version: 2,
        unit: "player",
        minParticipants: Math.max(1, Math.min(group.minimum, capacity)),
        minimumPolicy: group.policy,
        lockMinutesBeforeStart: Math.max(
          0,
          Math.round((detail.startsAt - group.lockAt) / 60_000),
        ),
        waitlist: group.waiting > 0,
        tiers: [],
        capacity,
      }
    : undefined;
  const outcome = detail.cancelled
    ? "cancelled-by-club"
    : outcomeFor(group?.displayState);
  return participationDisplay({
    ...(rule ? { rule } : {}),
    title: detail.title,
    capacity,
    booked,
    held: group?.held ?? 0,
    waiting: group?.waiting ?? 0,
    outcome,
    ...(group ? { lockAt: new Date(group.lockAt) } : {}),
    startsAt: new Date(detail.startsAt),
    endsAt: new Date(detail.endsAt),
    now: new Date(now),
    timeZone: detail.timeZone,
    ...(viewerTimeZone ? { viewerTimeZone } : {}),
    attendanceClosed: group?.displayState === "settled",
  });
}

/** The display model's words, rendered once for a screen. */
export function sessionCopy(display: ParticipationDisplay): {
  readonly status: string;
  readonly staff: string;
  readonly line?: string;
  readonly a11y: string;
} {
  return {
    status: renderParticipationCopy(display.status),
    staff: renderParticipationCopy(display.staff),
    ...(display.line ? { line: renderParticipationCopy(display.line) } : {}),
    a11y: renderParticipationCopy(display.a11y),
  };
}

/** Where the session is in its day. */
export type SessionPhase =
  | "upcoming"
  /** Within an hour of the start: check-in opens. */
  | "soon"
  | "live"
  /** Ended, attendance still open (24 hours). */
  | "ended"
  | "closed"
  | "cancelled";

export const CHECK_IN_OPENS_MS = 60 * 60_000;
export const ATTENDANCE_WINDOW_MS = 24 * 60 * 60_000;

export function sessionPhase(detail: SessionDetail, now: number): SessionPhase {
  if (detail.cancelled) return "cancelled";
  const state = detail.group?.displayState;
  if (state === "cancelled-low" || state === "cancelled-club")
    return "cancelled";
  if (now >= detail.endsAt + ATTENDANCE_WINDOW_MS) return "closed";
  if (now >= detail.endsAt) return "ended";
  if (now >= detail.startsAt) return "live";
  if (now >= detail.startsAt - CHECK_IN_OPENS_MS) return "soon";
  return "upcoming";
}

export type SessionActionKey =
  | "check-in"
  | "attendance"
  | "message"
  | "nudge"
  | "score"
  | "notes"
  | "stop-play"
  | "request-cancel"
  | "extend"
  | "run-anyway"
  | "cancel-refund"
  | "cancel-session"
  | "cancel-booking";

/** Interaction-kit tiers: 0 direct, 1 confirm, 2 strong. */
export type SessionActionTier = 0 | 1 | 2;

export interface SessionAction {
  readonly key: SessionActionKey;
  readonly label: string;
  readonly hint: string;
  readonly tier: SessionActionTier;
  readonly destructive?: boolean;
}

const ACTIONS: Readonly<Record<SessionActionKey, Omit<SessionAction, "key">>> =
  {
    "check-in": {
      label: "Check in",
      hint: "Opens the courtside checklist",
      tier: 0,
    },
    attendance: {
      label: "Take attendance",
      hint: "Marks who came; works without signal",
      tier: 0,
    },
    message: {
      label: "Message the group",
      hint: "Opens the group conversation; you review before anything sends",
      tier: 0,
    },
    nudge: {
      label: "Nudge the group",
      hint: "Drafts a message for you to review and send",
      tier: 0,
    },
    score: {
      label: "Score a match",
      hint: "Opens Courtside with this session's players",
      tier: 0,
    },
    notes: {
      label: "Record notes",
      hint: "Voice notes for you or a player",
      tier: 0,
    },
    "stop-play": {
      label: "Stop play",
      hint: "Stops play on this court and tells the people affected",
      tier: 2,
      destructive: true,
    },
    "request-cancel": {
      label: "Request to cancel",
      hint: "Asks a director to cancel; you give the reason",
      tier: 1,
    },
    extend: {
      label: "Extend the deadline",
      hint: "Moves the decision later; booked players are told",
      tier: 1,
    },
    "run-anyway": {
      label: "Run it anyway",
      hint: "Confirms the session even if the minimum is not reached",
      tier: 1,
    },
    "cancel-refund": {
      label: "Cancel and refund",
      hint: "Cancels and returns everyone's payment",
      tier: 2,
      destructive: true,
    },
    "cancel-session": {
      label: "Cancel session",
      hint: "Shows who gets what back before anything changes",
      tier: 2,
      destructive: true,
    },
    "cancel-booking": {
      label: "Cancel booking",
      hint: "Shows who gets what back before anything changes",
      tier: 2,
      destructive: true,
    },
  };

function action(key: SessionActionKey): SessionAction {
  return { key, ...ACTIONS[key] };
}

export interface ActionContext {
  readonly audience: SessionAudience;
  readonly now: number;
  /** Courtside has matches linked to this session. */
  readonly hasMatches?: boolean;
  /** Whether the server has the staff court-booking cancellation. */
  readonly courtBooking?: CourtBookingCapability;
}

/**
 * What a person can do with a session now, by role and phase, in the order
 * the screen lists them (the first is the primary action). The server still
 * checks every permission; a refusal shows the permission-denied state.
 */
export function sessionActions(
  detail: SessionDetail,
  context: ActionContext,
): readonly SessionAction[] {
  const phase = sessionPhase(detail, context.now);
  const director = context.audience === "owner";
  const state = detail.group?.displayState;
  const display = sessionDisplay(detail, context.now);
  const needsPlayers = display.state === "needs-players";
  const beforeLock = detail.group ? context.now < detail.group.lockAt : false;
  const started = context.now >= detail.startsAt;
  const hasRoster = detail.people.some(
    (person) => person.active && person.bookingId,
  );
  const list: SessionAction[] = [];
  if (phase === "cancelled" || phase === "closed") {
    if (detail.audienceKey && detail.people.length)
      list.push(action("message"));
    return list;
  }
  // Courtside first: what the coach needs at the court.
  if (hasRoster && detail.attendanceTarget) {
    // Group-session attendance opens at the start (the server refuses earlier).
    if (phase === "live" || (phase === "soon" && detail.source === "calendar"))
      list.push(action("check-in"));
    if (phase === "ended") list.push(action("attendance"));
  }
  if (context.hasMatches && (phase === "soon" || phase === "live"))
    list.push(action("score"));
  if (needsPlayers && !started && (beforeLock || !detail.group))
    list.push(action("nudge"));
  if (detail.audienceKey && detail.people.length) list.push(action("message"));
  if (detail.source === "calendar" && (phase === "live" || phase === "ended"))
    list.push(action("notes"));
  if (detail.venueId && (phase === "soon" || phase === "live"))
    list.push(action("stop-play"));
  if (director) {
    if (needsPlayers && !started && detail.subject) {
      list.push(action("extend"));
      if (detail.group?.policy === "cancel" && beforeLock)
        list.push(action("run-anyway"));
    }
    const plan = cancelPlanFor(detail, {
      audience: context.audience,
      courtBooking: context.courtBooking,
    });
    if (!started && plan.kind !== "none") {
      if (plan.kind !== "group-refund" || state !== "settled")
        list.push(action(plan.action));
    }
  } else if (!started && detail.subject) {
    list.push(action("request-cancel"));
  }
  return list;
}

/** "Thu, Dec 10 · 4:30 – 6:00 PM". */
export function sessionWhen(detail: SessionDetail, locale = "en-US"): string {
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: detail.timeZone,
  }).format(new Date(detail.startsAt));
  return `${day} · ${
    formatTimeRange(detail.startsAt, detail.endsAt, {
      locale,
      timeZone: detail.timeZone,
    }).text
  }`;
}

/** "Courts 1–2 · Pier Courts", or null when nothing is assigned. */
export function sessionWhere(detail: SessionDetail): string | null {
  const parts = [detail.courtName, detail.venueName].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "4:30 PM" in the session's zone. */
export function sessionTime(detail: SessionDetail, locale = "en-US"): string {
  return formatTime(detail.startsAt, { locale, timeZone: detail.timeZone });
}

export interface RosterSummary {
  readonly booked: number;
  readonly here: number;
  readonly absent: number;
  readonly unmarked: number;
}

/** Attendance as the phone sees it: Duna's marks with the queued ones on top. */
export function effectiveAttendance(
  person: SessionPerson,
  queued: ReadonlyMap<string, AttendanceStatus>,
): "attended" | "absent" | null {
  const local = person.bookingId ? queued.get(person.bookingId) : undefined;
  if (local === "attended" || local === "absent") return local;
  if (local === "unmarked") return null;
  return person.attendance;
}

export function rosterSummary(
  people: readonly SessionPerson[],
  queued: ReadonlyMap<string, AttendanceStatus> = new Map(),
): RosterSummary {
  const roster = people.filter((person) => person.active);
  let here = 0;
  let absent = 0;
  for (const person of roster) {
    const mark = effectiveAttendance(person, queued);
    if (mark === "attended") here += 1;
    else if (mark === "absent") absent += 1;
  }
  return {
    booked: roster.length,
    here,
    absent,
    unmarked: roster.length - here - absent,
  };
}

/** The roster in reading order: on the roster first, by name; then the waitlist. */
export function rosterOrder(
  people: readonly SessionPerson[],
): readonly SessionPerson[] {
  return [...people].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    if (left.waitlisted !== right.waitlisted) return left.waitlisted ? 1 : -1;
    return left.displayName.localeCompare(right.displayName);
  });
}

/**
 * What a cancellation returns, restated in the strong confirmation:
 * "3 people · 9 credits back to wallets · 1 card refund". Amounts only when
 * Duna returned money to this viewer.
 */
export function cancelSummary(
  detail: SessionDetail,
  occurrence?: OccurrenceInput,
): {
  readonly people: number;
  readonly credits?: number;
  readonly cardRefunds: number;
  readonly line: string;
} {
  const roster = detail.people.filter((person) => person.active);
  const people = roster.reduce((sum, person) => sum + person.places, 0);
  const bookings = occurrence?.bookings ?? [];
  const cardRefunds = bookings.filter(
    (booking) => booking.confirmed && booking.paymentMethod === "card",
  ).length;
  const creditTotal = bookings
    .filter((booking) => booking.paymentMethod !== "card")
    .reduce(
      (sum, booking) =>
        sum + (booking.settledCredits ?? booking.reservedCredits),
      0,
    );
  const parts = [`${people} ${people === 1 ? "person" : "people"}`];
  if (detail.moneyVisible && creditTotal > 0)
    parts.push(`${credits(creditTotal)} back to wallets`);
  else if (creditTotal > 0) parts.push("credits back to wallets");
  if (cardRefunds > 0)
    parts.push(`${cardRefunds} card refund${cardRefunds === 1 ? "" : "s"}`);
  return {
    people,
    ...(detail.moneyVisible ? { credits: creditTotal } : {}),
    cardRefunds,
    line: parts.join(" · "),
  };
}

/** A scorable match (`operator.scorableMatches`) as far as linking needs. */
export interface SessionMatchInput {
  readonly id: string;
  readonly status: string;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly courtName?: string;
  readonly sessionTitle?: string;
  readonly teamA: { readonly name: string };
  readonly teamB: { readonly name: string };
}

/**
 * Matches that belong to this session: the same session title, or on its
 * court during it. Live first, then by time.
 */
export function matchesForSession<T extends SessionMatchInput>(
  detail: SessionDetail,
  matches: readonly T[],
): readonly T[] {
  return matches
    .filter((match) => {
      if (match.status === "complete" || match.status === "cancelled")
        return false;
      if (match.sessionTitle && match.sessionTitle === detail.title)
        return true;
      if (!detail.courtName || match.courtName !== detail.courtName)
        return false;
      if (!match.scheduledAt) return match.status === "live";
      const at = Date.parse(match.scheduledAt);
      return at >= detail.startsAt - 30 * 60_000 && at < detail.endsAt;
    })
    .sort((left, right) => {
      if ((left.status === "live") !== (right.status === "live"))
        return left.status === "live" ? -1 : 1;
      return (
        Date.parse(left.scheduledAt ?? "") - Date.parse(right.scheduledAt ?? "")
      );
    });
}
