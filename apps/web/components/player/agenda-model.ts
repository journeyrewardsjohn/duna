/**
 * Play (`/app/play`): the person's plans as a calm agenda. Pure and tested
 * (`agenda-model.test.ts`). Two sources, as Home reads them: the dashboard's
 * bookings (registrations, pickups, court time) and the catalog session
 * bookings (lessons, clinics, programs). Each plan carries its group state in
 * the shared participation words, the truthful price line, the free
 * cancellation deadline from the backend's own fields, and the actions the
 * existing procedures allow.
 *
 * Days: a plan belongs to the calendar day where it happens (its venue's
 * zone), the day printed on the booking. When the viewer's clock shows a
 * different time, the plan adds "(9:00 PM your time)".
 */
import {
  formatMoney,
  formatParticipationTime,
  participationToken,
  renderParticipationCopy,
  type BookingSummary,
  type EventKind,
} from "@duna/core";
import {
  dayLabel,
  participationWords,
  timeRange,
} from "../app-shell/home/home-model";
import type { CatalogBooking } from "./api-types";

export type PlanTone = "positive" | "warning" | "attention" | "danger" | "info";

export type CancelPlan =
  | {
      readonly kind: "catalog";
      readonly bookingId: string;
      /** The backend says cancelling now returns everything. */
      readonly free: boolean;
      /** Credits a late cancellation costs (decision 4), when the backend says. */
      readonly lateCharge?: number;
      readonly creditsReserved: number;
    }
  | { readonly kind: "registration"; readonly bookingId: string }
  | { readonly kind: "pickup"; readonly pickupSessionId: string };

export interface PlanActions {
  /** Cancel my (or my junior's) place. */
  readonly cancel?: CancelPlan;
  /** Leave the waitlist (the same procedure as cancelling a waitlisted place). */
  readonly leaveWaitlist?: CancelPlan;
  /** A share link for the session (adults only; never a junior account). */
  readonly invite?: {
    readonly subjectType: "session" | "pickup-session";
    readonly subjectId: string;
  };
  /** Rejoin a waitlist after leaving it. */
  readonly joinWaitlist?: {
    readonly subjectType: "session" | "pickup-session";
    readonly subjectId: string;
    readonly participantPersonId?: string;
  };
  /** A pickup I host: change it, or call it off. */
  readonly edit?: string;
  readonly cancelHosted?: { readonly pickupSessionId: string };
}

export interface PlanItem {
  readonly id: string;
  readonly source: "catalog" | "registration" | "pickup" | "court";
  /** "Clinic", "Court time", "Pickup", "Lesson". */
  readonly kindLabel: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  /** `YYYY-MM-DD` where it happens. */
  readonly dayKey: string;
  readonly dayLabel: string;
  readonly timeRange: string;
  /** "(9:00 PM your time)" when the viewer's clock differs. */
  readonly yourTime?: string;
  readonly place: string;
  readonly stateLabel: string;
  readonly tone: PlanTone;
  /** The group state in the shared participation words. */
  readonly participation?: { readonly status: string; readonly line?: string };
  readonly priceLine?: string;
  /** "Free cancellation until Thu 6:00 PM", "Cancelling now returns nothing." */
  readonly cancellationLine?: string;
  readonly waitlist?: { readonly position?: number };
  readonly hosting: boolean;
  readonly forName?: string;
  readonly forPersonId?: string;
  readonly people: readonly string[];
  readonly href: string;
  readonly actions: PlanActions;
  readonly past: boolean;
}

export interface AgendaDay {
  readonly key: string;
  readonly label: string;
  readonly items: readonly PlanItem[];
}

export interface AgendaDependent {
  readonly personId: string;
  readonly firstName: string;
  readonly displayName: string;
}

export interface AgendaInput {
  readonly person: { readonly id: string; readonly displayName: string };
  readonly actingFor: AgendaDependent | null;
  readonly dependents: readonly AgendaDependent[];
  readonly bookings: readonly BookingSummary[];
  readonly catalog: readonly CatalogBooking[];
  /** Plans already cancelled or left in this view (so they leave the list at once). */
  readonly now: number;
  readonly viewerTimeZone: string;
  readonly locale?: string;
  /** Adults only: share links and hosting. */
  readonly adult: boolean;
}

export interface Agenda {
  readonly upcoming: readonly AgendaDay[];
  readonly past: readonly PlanItem[];
  readonly count: number;
}

export function safeZone(
  timeZone: string | undefined,
  fallback: string,
): string {
  if (!timeZone) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return fallback;
  }
}

/** `YYYY-MM-DD` of an instant in a zone. */
export function localDay(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function clock(instant: number, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(instant);
}

/** "(9:00 PM your time)" when the viewer's wall clock shows another time. */
export function yourTimeNote(
  instant: number,
  zone: string,
  viewerZone: string,
  locale = "en-US",
): string | undefined {
  const there = clock(instant, zone, locale);
  const here = clock(instant, viewerZone, locale);
  const sameDay = localDay(instant, zone) === localDay(instant, viewerZone);
  if (there === here && sameDay) return undefined;
  const day = sameDay
    ? ""
    : `${new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: viewerZone }).format(instant)} `;
  return `(${day}${here} your time)`;
}

const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  tournament: "Tournament",
  league: "League",
  clinic: "Clinic",
  "open-play": "Open play",
  "private-lesson": "Lesson",
  "court-rental": "Court time",
  pickup: "Pickup",
};

const SUBTYPE_LABEL: Readonly<Record<string, string>> = {
  "private-lesson": "Lesson",
  "semi-private-lesson": "Lesson",
  lesson: "Lesson",
  clinic: "Clinic",
  program: "Program",
  camp: "Camp",
  "open-play": "Open play",
};

const copy = (
  key: Parameters<typeof participationToken>[0],
  params?: Parameters<typeof participationToken>[1],
) => renderParticipationCopy(participationToken(key, params));

/**
 * The cancellation line for a catalog booking, from the backend's own fields
 * (`cancellable`, `refundIfCancelledNow`, `refundableUntil`,
 * `lateCancelCharge`) in the shared words.
 */
export function catalogCancellationLine(
  booking: Pick<
    CatalogBooking,
    | "cancellable"
    | "refundIfCancelledNow"
    | "refundableUntil"
    | "lateCancelCharge"
    | "startsAt"
    | "timezone"
  >,
  now: number,
  viewerTimeZone?: string,
): string | undefined {
  if (!booking.cancellable) {
    return Date.parse(booking.startsAt) <= now
      ? copy("cancel.closed")
      : undefined;
  }
  if (booking.refundIfCancelledNow && booking.refundableUntil) {
    const lock = formatParticipationTime({
      at: new Date(booking.refundableUntil),
      now: new Date(now),
      timeZone: booking.timezone,
      ...(viewerTimeZone ? { viewerTimeZone } : {}),
    });
    return copy("cancel.free", { lock: lock.labelWithViewer ?? lock.label });
  }
  if (booking.refundIfCancelledNow) return undefined;
  return booking.lateCancelCharge !== undefined && booking.lateCancelCharge > 0
    ? copy("cancel.late", { final: booking.lateCancelCharge })
    : copy("cancel.late-nothing");
}

/** The free-cancellation line for a registration, from `cancellationDeadline`. */
export function registrationCancellationLine(
  booking: Pick<
    BookingSummary,
    "canCancel" | "cancellationDeadline" | "venueTimezone" | "startsAt"
  >,
  now: number,
  viewerTimeZone?: string,
): string | undefined {
  if (!booking.canCancel) {
    return Date.parse(booking.startsAt) <= now
      ? copy("cancel.closed")
      : undefined;
  }
  if (!booking.cancellationDeadline) return undefined;
  const deadline = Date.parse(booking.cancellationDeadline);
  const at = formatParticipationTime({
    at: new Date(deadline),
    now: new Date(now),
    ...(booking.venueTimezone ? { timeZone: booking.venueTimezone } : {}),
    ...(viewerTimeZone ? { viewerTimeZone } : {}),
  });
  return deadline > now
    ? copy("cancel.free", { lock: at.labelWithViewer ?? at.label })
    : `Free cancellation ended ${at.label}.`;
}

/** The price line: what the booking costs, as the booking says it. */
export function catalogPriceLine(booking: CatalogBooking): string | undefined {
  if (booking.creditsSettled !== undefined) {
    return copy("price.decided", { final: booking.creditsSettled });
  }
  if (booking.creditsReserved > 0) {
    return copy("price.now-fixed", { max: booking.creditsReserved });
  }
  return undefined;
}

export function registrationPriceLine(
  booking: Pick<BookingSummary, "amount" | "paymentStatus">,
): string | undefined {
  const amount = booking.amount.amountMinor;
  const money = formatMoney(amount, booking.amount.currency);
  switch (booking.paymentStatus) {
    case "free":
      return "No charge";
    case "paid":
      return `${money} paid`;
    case "payment-required":
      return `${money} due`;
    case "refunded":
      return `${money} refunded`;
    default:
      return amount === 0 ? undefined : money;
  }
}

function fromBooking(
  booking: BookingSummary,
  input: AgendaInput,
  forPerson?: AgendaDependent,
): PlanItem {
  const locale = input.locale ?? "en-US";
  const zone = safeZone(booking.venueTimezone, input.viewerTimeZone);
  const start = Date.parse(booking.startsAt);
  const end = Date.parse(booking.endsAt);
  const past = end <= input.now;
  const source =
    booking.source ?? (booking.kind === "pickup" ? "pickup" : "registration");
  const hosting = booking.pickup?.isCreator === true;
  const waitlisted = booking.status === "waitlisted";
  const due = booking.paymentStatus === "payment-required";
  const state = waitlisted
    ? { label: "On the waitlist", tone: "warning" as const }
    : booking.status === "needs-action"
      ? { label: "Needs you", tone: "attention" as const }
      : due
        ? { label: "Payment due", tone: "attention" as const }
        : hosting
          ? { label: "You're hosting", tone: "info" as const }
          : { label: "Confirmed", tone: "positive" as const };
  const placeOf: CancelPlan | undefined =
    source === "pickup" && booking.sessionId && !hosting
      ? { kind: "pickup", pickupSessionId: booking.sessionId }
      : source === "registration" && booking.canCancel
        ? { kind: "registration", bookingId: booking.id }
        : undefined;
  const subjectType =
    source === "pickup" ? ("pickup-session" as const) : ("session" as const);
  const pickup = booking.pickup;
  const participation =
    pickup && !waitlisted
      ? {
          status:
            pickup.spotsRemaining > 0
              ? copy("status.spots", { n: pickup.spotsRemaining })
              : copy("status.full"),
        }
      : undefined;
  return {
    id: `booking:${booking.id}`,
    source,
    kindLabel: KIND_LABEL[booking.kind] ?? "Plan",
    title: booking.title,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timeZone: zone,
    dayKey: localDay(start, zone),
    dayLabel: dayLabel(start, input.now, zone, locale),
    timeRange: timeRange(start, end, zone, locale),
    ...(yourTimeNote(start, zone, input.viewerTimeZone, locale)
      ? { yourTime: yourTimeNote(start, zone, input.viewerTimeZone, locale) }
      : {}),
    place: [
      booking.organization?.name,
      booking.court?.name
        ? `${booking.venueName} · ${booking.court.name}`
        : booking.venueName,
    ]
      .filter(Boolean)
      .join(" · "),
    stateLabel: state.label,
    tone: state.tone,
    ...(participation ? { participation } : {}),
    ...(registrationPriceLine(booking)
      ? { priceLine: registrationPriceLine(booking) }
      : {}),
    ...(!past && !waitlisted && placeOf
      ? {
          cancellationLine: registrationCancellationLine(
            booking,
            input.now,
            input.viewerTimeZone,
          ),
        }
      : {}),
    ...(waitlisted ? { waitlist: {} } : {}),
    hosting,
    ...(forPerson
      ? { forName: forPerson.firstName, forPersonId: forPerson.personId }
      : {}),
    people: booking.participantNames.filter(
      (name) => name !== input.person.displayName,
    ),
    href:
      booking.details?.path ??
      (booking.sessionSlug ? `/events/${booking.sessionSlug}` : "/app/play"),
    past,
    actions: past
      ? {}
      : {
          ...(placeOf && !waitlisted ? { cancel: placeOf } : {}),
          ...(placeOf && waitlisted ? { leaveWaitlist: placeOf } : {}),
          ...(input.adult && booking.sessionId && !input.actingFor
            ? {
                invite: { subjectType, subjectId: booking.sessionId },
                joinWaitlist: {
                  subjectType,
                  subjectId: booking.sessionId,
                  ...(forPerson
                    ? { participantPersonId: forPerson.personId }
                    : {}),
                },
              }
            : {}),
          ...(hosting && booking.sessionSlug
            ? { edit: `/app/pickup/${booking.sessionSlug}/edit` }
            : {}),
          // A host can call a pickup off only before anyone else joins
          // (pickup-service `cancelPickup`).
          ...(hosting && booking.sessionId && (pickup?.confirmedCount ?? 0) <= 1
            ? { cancelHosted: { pickupSessionId: booking.sessionId } }
            : {}),
        },
  };
}

function fromCatalog(
  booking: CatalogBooking,
  input: AgendaInput,
  forPerson?: AgendaDependent,
): PlanItem {
  const locale = input.locale ?? "en-US";
  const zone = safeZone(booking.timezone, input.viewerTimeZone);
  const start = Date.parse(booking.startsAt);
  const end = Date.parse(booking.endsAt);
  const past =
    end <= input.now ||
    booking.status === "attended" ||
    booking.status === "no-show";
  const due = booking.status === "pending-payment";
  const waiting = booking.waitlistPosition !== undefined;
  const cancelled =
    booking.status === "cancelled" ||
    booking.status === "refunded" ||
    booking.sessionStatus === "cancelled";
  const participation = participationWords(booking);
  const state = cancelled
    ? { label: "Cancelled", tone: "danger" as const }
    : due
      ? { label: "Payment due", tone: "attention" as const }
      : waiting
        ? { label: "On the waitlist", tone: "warning" as const }
        : booking.status === "attended"
          ? { label: "Attended", tone: "positive" as const }
          : booking.status === "no-show"
            ? { label: "Marked absent", tone: "warning" as const }
            : { label: "Confirmed", tone: "positive" as const };
  const cancel: CancelPlan = {
    kind: "catalog",
    bookingId: booking.bookingId,
    free: booking.refundIfCancelledNow,
    ...(booking.lateCancelCharge !== undefined
      ? { lateCharge: booking.lateCancelCharge }
      : {}),
    creditsReserved: booking.creditsReserved,
  };
  const live = !past && !cancelled && booking.cancellable;
  return {
    id: `catalog:${booking.bookingId}`,
    source: "catalog",
    kindLabel: SUBTYPE_LABEL[booking.subtype] ?? "Session",
    title: booking.title,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timeZone: zone,
    dayKey: localDay(start, zone),
    dayLabel: dayLabel(start, input.now, zone, locale),
    timeRange: timeRange(start, end, zone, locale),
    ...(yourTimeNote(start, zone, input.viewerTimeZone, locale)
      ? { yourTime: yourTimeNote(start, zone, input.viewerTimeZone, locale) }
      : {}),
    place: [booking.organization.name, booking.venue?.name]
      .filter(Boolean)
      .join(" · "),
    stateLabel: state.label,
    tone: state.tone,
    ...(participation ? { participation } : {}),
    ...(catalogPriceLine(booking)
      ? { priceLine: catalogPriceLine(booking) }
      : {}),
    ...(!past && !cancelled
      ? {
          cancellationLine: catalogCancellationLine(
            booking,
            input.now,
            input.viewerTimeZone,
          ),
        }
      : {}),
    ...(waiting ? { waitlist: { position: booking.waitlistPosition } } : {}),
    hosting: false,
    ...(forPerson
      ? { forName: forPerson.firstName, forPersonId: forPerson.personId }
      : {}),
    people: booking.coaches.map((coach) => coach.displayName),
    href: `/app/checkout/${booking.catalogItemSlug}`,
    past,
    actions: live ? (waiting ? { leaveWaitlist: cancel } : { cancel }) : {},
  };
}

/** Everything on the person's (or the junior's) calendar, as an agenda. */
export function buildAgenda(input: AgendaInput): Agenda {
  const dependents = new Map(
    input.dependents.map((dependent) => [dependent.personId, dependent]),
  );
  const acting = input.actingFor;
  const juniorOf = (personId: string) =>
    dependents.get(personId) ??
    (acting?.personId === personId ? acting : undefined);

  const fromDashboard = input.bookings.flatMap((booking) => {
    const ids = new Set(
      (booking.participants ?? []).map((person) => person.personId),
    );
    if (acting) {
      return ids.has(acting.personId)
        ? [fromBooking(booking, input, acting)]
        : [];
    }
    const junior =
      ids.size > 0 && !ids.has(input.person.id)
        ? [...ids].map(juniorOf).find(Boolean)
        : undefined;
    return [fromBooking(booking, input, junior)];
  });
  const fromCatalogBookings = input.catalog.flatMap((booking) => {
    const personId = booking.participant.personId;
    if (acting) {
      return personId === acting.personId
        ? [fromCatalog(booking, input, acting)]
        : [];
    }
    if (booking.participant.isSelf || personId === input.person.id) {
      return [fromCatalog(booking, input)];
    }
    const junior = juniorOf(personId);
    return junior ? [fromCatalog(booking, input, junior)] : [];
  });
  // A registration can appear in both lists: keep the dashboard's copy.
  const seen = new Set(
    fromDashboard.map(
      (item) => `${item.title}|${item.startsAt}|${item.forPersonId ?? ""}`,
    ),
  );
  const all = [
    ...fromDashboard,
    ...fromCatalogBookings.filter(
      (item) =>
        !seen.has(`${item.title}|${item.startsAt}|${item.forPersonId ?? ""}`),
    ),
  ];
  const upcoming = all
    .filter((item) => !item.past && item.stateLabel !== "Cancelled")
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
  const days: AgendaDay[] = [];
  for (const item of upcoming) {
    const day = days.find((candidate) => candidate.key === item.dayKey);
    if (day) (day.items as PlanItem[]).push(item);
    else days.push({ key: item.dayKey, label: item.dayLabel, items: [item] });
  }
  const past = all
    .filter((item) => item.past)
    .sort(
      (left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt),
    )
    .slice(0, 20);
  return { upcoming: days, past, count: upcoming.length };
}

/** RFC 5545 text escaping. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsInstant(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** A calendar file for one plan (the person downloads it themselves). */
export function icsFor(
  item: Pick<PlanItem, "id" | "title" | "startsAt" | "endsAt" | "place">,
  stamp: string,
): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Duna//Plans//EN",
    "BEGIN:VEVENT",
    `UID:${icsText(item.id)}@duna.coach`,
    `DTSTAMP:${icsInstant(stamp)}`,
    `DTSTART:${icsInstant(item.startsAt)}`,
    `DTEND:${icsInstant(item.endsAt)}`,
    `SUMMARY:${icsText(item.title)}`,
    ...(item.place ? [`LOCATION:${icsText(item.place)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
