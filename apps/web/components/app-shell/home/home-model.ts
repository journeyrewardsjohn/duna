/**
 * Player web Home's data, derived from what the API already returns (the
 * dashboard, the player's catalog session bookings, payment schedules,
 * club wallets). Pure and unit-tested (`home-model.test.ts`); it mirrors the
 * Player app's Home model (`apps/player/src/features/home/home-model.ts`) so
 * both say the same things in the same order.
 *
 * Rules kept from the old Home: "Next up" is the person's next FUTURE booking
 * (filtered here even though the API is expected to do it) and comes before
 * discovery. Nothing is invented: an empty block says so.
 */
import {
  renderParticipationCopy,
  participationToken,
  type BookingSummary,
  type EventSummary,
  type SandRating,
} from "@duna/core";

/** The slice of a catalog session booking Home reads (`player.catalogSessionBookings`). */
export interface HomeCatalogBooking {
  readonly bookingId: string;
  readonly status:
    | "confirmed"
    | "pending-payment"
    | "attended"
    | "no-show"
    | "cancelled"
    | "refunded";
  readonly catalogItemSlug: string;
  readonly title: string;
  readonly organization: { readonly name: string; readonly slug: string };
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly sessionStatus: "scheduled" | "cancelled" | "complete";
  readonly venue?: { readonly name: string };
  readonly participant: {
    readonly personId: string;
    readonly displayName: string;
    readonly isSelf: boolean;
  };
  readonly participation?: {
    readonly bookedCount: number;
    readonly playersNeeded: number;
    readonly spotsRemaining: number;
    readonly displayState?:
      | "needs-players"
      | "minimum-reached"
      | "full"
      | "confirmed"
      | "running-small"
      | "cancelled-low"
      | "cancelled-club"
      | "done"
      | "settled";
    readonly waitlistCount?: number;
  };
  readonly waitlistPosition?: number;
}

export interface HomePaymentSchedule {
  readonly id: string;
  readonly title: string;
  readonly status:
    | "scheduled"
    | "active"
    | "past-due"
    | "completed"
    | "cancelled"
    | "refunded";
}

export interface HomeMatch {
  readonly id: string;
  readonly status?: string;
  readonly confirmationRequired?: boolean;
  readonly playedAt: string;
  readonly venueName: string;
  readonly winner: "A" | "B";
  readonly ratingDelta: number;
  readonly teamA: readonly {
    readonly id: string;
    readonly displayName: string;
  }[];
  readonly teamB: readonly {
    readonly id: string;
    readonly displayName: string;
  }[];
}

export interface HomeClubWallet {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationName: string;
  readonly credits: number;
  readonly status: "active" | "frozen" | "closed";
  readonly membershipName?: string;
  readonly membershipStatus?: string;
  readonly membershipCurrentPeriodEndsAt?: string;
}

export interface HomePerson {
  readonly id: string;
  readonly displayName: string;
  readonly firstName: string;
  readonly rating: SandRating;
}

export interface HomeDependent {
  readonly personId: string;
  readonly displayName: string;
  readonly firstName: string;
}

/** A thing on the person's calendar, from either booking source. */
export interface HomeItem {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  /** "Today", "Tomorrow", "Sat, Nov 28". */
  readonly day: string;
  /** "3:45 – 5:15 PM". */
  readonly timeRange: string;
  /** "Sunset Beach Club · Court 4". */
  readonly place: string;
  /** "Confirmed", "On the waitlist", "Needs you", "Payment due". */
  readonly stateLabel: string;
  readonly tone: "positive" | "warning" | "attention" | "danger" | "info";
  /** "Starts in 2h 05m", "On now". */
  readonly countdown: string;
  /** The group-session words from the shared copy table, when it is one. */
  readonly participation?: { readonly status: string; readonly line?: string };
  /** The junior it is for ("For Remy"); absent when it is the viewer's own. */
  readonly forName?: string;
  readonly forPersonId?: string;
  readonly people: readonly string[];
  readonly href: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly event?: EventSummary;
}

export interface HomeNeed {
  readonly id: string;
  readonly kind: "booking" | "payment" | "score" | "schedule";
  readonly title: string;
  readonly detail: string;
  readonly action: string;
  readonly href: string;
  readonly forName?: string;
}

export interface HomeRating {
  readonly value: number | null;
  readonly delta: number | null;
  readonly reliability: number;
  readonly summary: string;
  readonly form: readonly ("W" | "L")[];
  readonly matchesPlayed: number;
}

export interface HomeHouseholdEntry {
  readonly dependent: HomeDependent;
  readonly next: HomeItem | null;
}

export interface HomeModel {
  /** Whose Home this is: the viewer, or the junior they are acting for. */
  readonly subject: { readonly personId: string; readonly firstName: string };
  readonly actingFor: boolean;
  readonly greeting: string;
  readonly dateLine: string;
  readonly nextUp: HomeItem | null;
  readonly week: readonly HomeItem[];
  readonly needsYou: readonly HomeNeed[];
  readonly rating: HomeRating | null;
  readonly household: readonly HomeHouseholdEntry[];
  /** Nothing booked, played or joined yet: guide to the first action. */
  readonly firstUse: boolean;
}

export interface HomeInput {
  readonly person: HomePerson;
  readonly actingFor: HomeDependent | null;
  readonly dependents: readonly HomeDependent[];
  readonly bookings: readonly BookingSummary[];
  readonly events: readonly EventSummary[];
  readonly catalogBookings: readonly HomeCatalogBooking[];
  readonly recentMatches: readonly HomeMatch[];
  readonly paymentSchedules: readonly HomePaymentSchedule[];
  readonly region?: string;
  readonly now: number;
  /** The viewer's time zone for the greeting and date line. */
  readonly timeZone: string;
  readonly locale?: string;
}

const BOOKING_STATE: Readonly<
  Record<
    BookingSummary["status"],
    { readonly label: string; readonly tone: HomeItem["tone"] }
  >
> = {
  confirmed: { label: "Confirmed", tone: "positive" },
  waitlisted: { label: "On the waitlist", tone: "warning" },
  "needs-action": { label: "Needs you", tone: "attention" },
};

const RELIABILITY: Readonly<Record<SandRating["confidence"], number>> = {
  Provisional: 1,
  Developing: 2,
  Reliable: 3,
  Locked: 3,
};

/** "Good morning" before noon, "Good afternoon" to 5 PM, then "Good evening". */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function safeZone(timeZone: string | undefined, fallback: string): string {
  if (!timeZone) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return fallback;
  }
}

function hourIn(instant: number, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
  return Number(hour) % 24;
}

function calendarDay(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone,
  }).formatToParts(instant);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(value("year"), value("month") - 1, value("day")) / 86_400_000;
}

export function dayLabel(
  startsAt: number,
  now: number,
  timeZone: string,
  locale: string,
): string {
  const distance = calendarDay(startsAt, timeZone) - calendarDay(now, timeZone);
  if (distance === 0) return "Today";
  if (distance === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(startsAt);
}

/** "3:45 – 5:15 PM", or "11:00 AM – 1:00 PM" across noon. */
export function timeRange(
  startsAt: number,
  endsAt: number,
  timeZone: string,
  locale: string,
): string {
  const format = (instant: number) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).formatToParts(instant);
  const start = format(startsAt);
  const end = format(endsAt);
  const period = (parts: Intl.DateTimeFormatPart[]) =>
    parts.find((part) => part.type === "dayPeriod")?.value;
  const text = (parts: Intl.DateTimeFormatPart[], withPeriod: boolean) =>
    parts
      .filter((part) => withPeriod || part.type !== "dayPeriod")
      .map((part) => part.value)
      .join("")
      .trim();
  const samePeriod = period(start) === period(end);
  return `${text(start, !samePeriod)} – ${text(end, true)}`;
}

/** "Starts in 2h 05m", "Starts in 3d 4h", "On now". */
export function countdownText(
  startsAt: number,
  endsAt: number,
  now: number,
): string {
  if (now >= startsAt && now < endsAt) return "On now";
  const minutes = Math.floor((startsAt - now) / 60_000);
  if (minutes < 1) return "Starting now";
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${String(rest).padStart(2, "0")}m`;
  return `Starts in ${rest}m`;
}

/**
 * The words for a group session, from the shared copy table
 * (`renderParticipationCopy`, the same function web, HQ and the apps use).
 * Only parts the booking carries are rendered: the "confirms if" line needs
 * the session's rule, which the booking list does not include (Needs API).
 */
export function participationWords(
  booking: HomeCatalogBooking,
): HomeItem["participation"] {
  const state = booking.participation;
  if (!state?.displayState) return undefined;
  const render = (
    key: Parameters<typeof participationToken>[0],
    params?: Parameters<typeof participationToken>[1],
  ) => renderParticipationCopy(participationToken(key, params));
  switch (state.displayState) {
    case "needs-players":
      return { status: render("status.needs", { n: state.playersNeeded }) };
    case "minimum-reached":
      return { status: render("status.reached") };
    case "full":
      return {
        status: render("status.full"),
        ...(state.waitlistCount
          ? { line: render("line.full-waiting", { n: state.waitlistCount }) }
          : {}),
      };
    case "confirmed":
      return { status: render("status.confirmed", { n: state.bookedCount }) };
    case "running-small":
      return { status: render("status.confirmed-small") };
    case "cancelled-low":
      return { status: render("status.cancelled-low") };
    case "cancelled-club":
      return {
        status: render("status.cancelled-club", {
          club: booking.organization.name,
        }),
      };
    case "done":
    case "settled":
      return { status: render("status.done") };
  }
}

function inFuture(endsAt: string, now: number): boolean {
  return Date.parse(endsAt) > now;
}

function linkedEvent(
  booking: BookingSummary,
  events: readonly EventSummary[],
): EventSummary | undefined {
  const key = (title: string) =>
    title
      .replace(/\s*[—-]\s*week\s+\d+\s*$/i, "")
      .trim()
      .toLocaleLowerCase("en-US");
  return events.find(
    (event) =>
      event.id === booking.sessionId ||
      (key(event.title) === key(booking.title) &&
        Math.abs(Date.parse(event.startsAt) - Date.parse(booking.startsAt)) <
          15 * 60_000),
  );
}

function fromDashboardBooking(
  booking: BookingSummary,
  input: HomeInput,
  locale: string,
  forPerson?: HomeDependent,
): HomeItem {
  const event = linkedEvent(booking, input.events);
  const zone = safeZone(
    event?.timezone ?? booking.venueTimezone,
    input.timeZone,
  );
  const start = Date.parse(booking.startsAt);
  const end = Date.parse(booking.endsAt);
  const state = BOOKING_STATE[booking.status];
  const latitude =
    event?.weather?.latitude ??
    event?.location?.latitude ??
    booking.location?.latitude;
  const longitude =
    event?.weather?.longitude ??
    event?.location?.longitude ??
    booking.location?.longitude;
  return {
    id: `booking:${booking.id}`,
    title: booking.title,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timeZone: zone,
    day: dayLabel(start, input.now, zone, locale),
    timeRange: timeRange(start, end, zone, locale),
    place: [
      event?.organizationName ?? booking.organization?.name,
      booking.court?.name ?? booking.venueName,
    ]
      .filter(Boolean)
      .join(" · "),
    stateLabel: state.label,
    tone: state.tone,
    countdown: countdownText(start, end, input.now),
    ...(forPerson
      ? { forName: forPerson.firstName, forPersonId: forPerson.personId }
      : {}),
    people: booking.participantNames.filter(
      (name) => name !== input.person.displayName,
    ),
    href:
      booking.details?.path ?? (event ? `/events/${event.slug}` : "/app/play"),
    ...(latitude !== undefined && longitude !== undefined
      ? { latitude, longitude }
      : {}),
    ...(event ? { event } : {}),
  };
}

function fromCatalogBooking(
  booking: HomeCatalogBooking,
  input: HomeInput,
  locale: string,
  forPerson?: HomeDependent,
): HomeItem {
  const zone = safeZone(booking.timezone, input.timeZone);
  const start = Date.parse(booking.startsAt);
  const end = Date.parse(booking.endsAt);
  const due = booking.status === "pending-payment";
  const waiting = booking.waitlistPosition !== undefined;
  const participation = participationWords(booking);
  return {
    id: `catalog:${booking.bookingId}`,
    title: booking.title,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timeZone: zone,
    day: dayLabel(start, input.now, zone, locale),
    timeRange: timeRange(start, end, zone, locale),
    place: [booking.organization.name, booking.venue?.name]
      .filter(Boolean)
      .join(" · "),
    stateLabel: due ? "Payment due" : waiting ? "On the waitlist" : "Confirmed",
    tone: due ? "attention" : waiting ? "warning" : "positive",
    countdown: countdownText(start, end, input.now),
    ...(participation ? { participation } : {}),
    ...(forPerson
      ? { forName: forPerson.firstName, forPersonId: forPerson.personId }
      : {}),
    people: [],
    href: `/app/checkout/${booking.catalogItemSlug}`,
  };
}

const ACTIVE_CATALOG = new Set<HomeCatalogBooking["status"]>([
  "confirmed",
  "pending-payment",
]);

function itemsFor(
  subjectId: string,
  input: HomeInput,
  locale: string,
  options: { readonly withDependents: boolean },
): HomeItem[] {
  const dependents = new Map(
    input.dependents.map((dependent) => [dependent.personId, dependent]),
  );
  const acting = input.actingFor;
  const forJunior = (personId: string) =>
    dependents.get(personId) ??
    (acting?.personId === personId ? acting : undefined);

  const dashboard = input.bookings
    .filter((booking) => inFuture(booking.endsAt, input.now))
    .flatMap((booking) => {
      const ids = new Set(
        (booking.participants ?? []).map((person) => person.personId),
      );
      if (acting) {
        return ids.has(acting.personId)
          ? [fromDashboardBooking(booking, input, locale, acting)]
          : [];
      }
      // The dashboard lists the viewer's own bookings. A booking whose only
      // known participant is one of their juniors is labelled for them.
      const junior =
        options.withDependents && ids.size > 0 && !ids.has(subjectId)
          ? [...ids].map(forJunior).find(Boolean)
          : undefined;
      return [fromDashboardBooking(booking, input, locale, junior)];
    });
  const catalog = input.catalogBookings
    .filter(
      (booking) =>
        ACTIVE_CATALOG.has(booking.status) &&
        booking.sessionStatus !== "cancelled" &&
        inFuture(booking.endsAt, input.now),
    )
    .flatMap((booking) => {
      const personId = booking.participant.personId;
      if (acting) {
        return personId === acting.personId
          ? [fromCatalogBooking(booking, input, locale, acting)]
          : [];
      }
      if (booking.participant.isSelf || personId === subjectId) {
        return [fromCatalogBooking(booking, input, locale)];
      }
      const junior = options.withDependents ? forJunior(personId) : undefined;
      return junior ? [fromCatalogBooking(booking, input, locale, junior)] : [];
    });
  // A registration can appear in both lists: keep the dashboard's copy.
  const seen = new Set(
    dashboard.map(
      (item) => `${item.title}|${item.startsAt}|${item.forPersonId ?? ""}`,
    ),
  );
  return [
    ...dashboard,
    ...catalog.filter(
      (item) =>
        !seen.has(`${item.title}|${item.startsAt}|${item.forPersonId ?? ""}`),
    ),
  ].sort(
    (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
  );
}

export function ratingSnapshot(
  rating: SandRating,
  matches: readonly HomeMatch[],
  personId: string,
): HomeRating {
  const provisional = rating.confidence === "Provisional";
  const delta = rating.delta ?? matches[0]?.ratingDelta ?? null;
  const form = matches.slice(0, 5).map((match) => {
    const onA = match.teamA.some((person) => person.id === personId);
    return match.winner === (onA ? "A" : "B") ? ("W" as const) : ("L" as const);
  });
  const latest = matches[0];
  const summary =
    matches.length === 0
      ? "Play and confirm your first match to start your Sand Rating."
      : provisional
        ? "Provisional: a few more confirmed results settle it."
        : latest && delta !== null && delta !== 0
          ? `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta).toFixed(2)} after your ${
              form[0] === "W" ? "win" : "match"
            } at ${latest.venueName}.`
          : "Steady since your last result.";
  return {
    value: provisional ? null : rating.display,
    delta,
    reliability: RELIABILITY[rating.confidence],
    summary,
    form,
    matchesPlayed: matches.length,
  };
}

export function buildHomeModel(input: HomeInput): HomeModel {
  const locale = input.locale ?? "en-US";
  const acting = input.actingFor;
  const subject = acting
    ? { personId: acting.personId, firstName: acting.firstName }
    : { personId: input.person.id, firstName: input.person.firstName };
  const items = itemsFor(subject.personId, input, locale, {
    withDependents: !acting,
  });
  const nextUp = items[0] ?? null;
  const bookedIds = new Set(
    items.flatMap((item) => (item.event ? [item.event.id] : [])),
  );

  // Open events from the person's clubs and nearby: only on their own Home.
  const openEvents: HomeItem[] = acting
    ? []
    : input.events
        .filter(
          (event) =>
            inFuture(event.endsAt, input.now) &&
            event.lifecycleStatus !== "cancelled" &&
            !["pickup", "open-play"].includes(event.kind) &&
            !bookedIds.has(event.id),
        )
        .map((event) => {
          const zone = safeZone(event.timezone, input.timeZone);
          const start = Date.parse(event.startsAt);
          const end = Date.parse(event.endsAt);
          return {
            id: `event:${event.id}`,
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timeZone: zone,
            day: dayLabel(start, input.now, zone, locale),
            timeRange: timeRange(start, end, zone, locale),
            place: [event.organizationName, event.venueName]
              .filter(Boolean)
              .join(" · "),
            stateLabel: event.spotsRemaining > 0 ? "Register" : "Full",
            tone: "info" as const,
            countdown: countdownText(start, end, input.now),
            people: [],
            href: `/events/${event.slug}`,
            event,
          };
        });
  const week = [...items.slice(1), ...openEvents]
    .filter((item) => Date.parse(item.startsAt) - input.now < 8 * 86_400_000)
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .slice(0, 6);

  const needsYou: HomeNeed[] = [
    ...items
      .filter(
        (item) =>
          item.stateLabel === "Needs you" || item.stateLabel === "Payment due",
      )
      .map((item) => ({
        id: `need:${item.id}`,
        kind:
          item.stateLabel === "Payment due"
            ? ("payment" as const)
            : ("booking" as const),
        title:
          item.stateLabel === "Payment due"
            ? `Pay for ${item.forName ? `${item.forName}'s place in ` : ""}${item.title}`
            : `Finish ${item.forName ? `${item.forName}'s ` : ""}booking: ${item.title}`,
        detail: `${item.day} · ${item.timeRange}${item.place ? ` · ${item.place}` : ""}`,
        action: item.stateLabel === "Payment due" ? "Pay now" : "Review",
        href: item.href,
        ...(item.forName ? { forName: item.forName } : {}),
      })),
    ...(acting
      ? []
      : input.recentMatches
          .filter(
            (match) =>
              match.confirmationRequired === true &&
              match.status === "pending-verification",
          )
          .map((match) => {
            const onA = match.teamA.some(
              (person) => person.id === input.person.id,
            );
            const opponents = (onA ? match.teamB : match.teamA)
              .map((person) => person.displayName)
              .join(" and ");
            return {
              id: `need:match:${match.id}`,
              kind: "score" as const,
              title: "Confirm a score",
              detail: `${opponents ? `Against ${opponents} · ` : ""}${match.venueName}`,
              action: "Review score",
              href: `/app/matches/${match.id}`,
            };
          })),
    ...(acting
      ? []
      : input.paymentSchedules
          .filter((schedule) => schedule.status === "past-due")
          .map((schedule) => ({
            id: `need:schedule:${schedule.id}`,
            kind: "schedule" as const,
            title: `A payment for ${schedule.title} is past due`,
            detail: "Update your card or pay the installment in your wallet.",
            action: "Open wallet",
            href: "/app/wallet",
          }))),
  ];

  const household: HomeHouseholdEntry[] = acting
    ? []
    : input.dependents.map((dependent) => ({
        dependent,
        next:
          items.find((item) => item.forPersonId === dependent.personId) ?? null,
      }));

  const zone = safeZone(input.timeZone, "UTC");
  const dateLine = [
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: zone,
    }).format(input.now),
    input.region,
  ]
    .filter(Boolean)
    .join(" · ");
  const greeting = acting
    ? `${acting.firstName}'s week`
    : `${greetingFor(hourIn(input.now, zone))}, ${input.person.firstName}.`;

  return {
    subject,
    actingFor: Boolean(acting),
    greeting,
    dateLine,
    nextUp,
    week,
    needsYou,
    rating: acting
      ? null
      : ratingSnapshot(
          input.person.rating,
          input.recentMatches,
          input.person.id,
        ),
    household,
    firstUse:
      !acting &&
      items.length === 0 &&
      input.recentMatches.length === 0 &&
      input.catalogBookings.length === 0,
  };
}
