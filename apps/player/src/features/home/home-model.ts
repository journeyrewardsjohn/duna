/**
 * Home's data, derived from what the Player runtime already loads (the
 * dashboard: player, bookings, events, recent matches). No new queries.
 * Pure and unit-tested (`home-model.test.ts`).
 *
 * The contract rule kept from the old Home: "Next up" is the signed-in
 * player's next FUTURE booking, filtered here even though the API is
 * expected to do it too, and it comes before discovery.
 */
import type { BookingSummary, EventSummary, SandRating } from "@duna/core";
import {
  countdownParts,
  formatCountdown,
  formatTimeRange,
  sunTimes,
  zonedParts,
  type HourlyConditions,
  type SunTimes,
} from "@duna/tideline-core";

/** A booking and the event it belongs to (when the event is listed). */
export function linkedHomeEvent(
  booking: BookingSummary,
  events: readonly EventSummary[],
): EventSummary | undefined {
  const titleKey = (title: string) =>
    title
      .replace(/\s*[—-]\s*week\s+\d+\s*$/i, "")
      .trim()
      .toLocaleLowerCase("en-US");
  return events.find(
    (event) =>
      event.id === booking.sessionId ||
      (titleKey(event.title) === titleKey(booking.title) &&
        Math.abs(
          new Date(event.startsAt).getTime() -
            new Date(booking.startsAt).getTime(),
        ) <
          15 * 60_000),
  );
}

export type BookingState = BookingSummary["status"];

export interface HomeNextUp {
  readonly bookingId: string;
  readonly event?: EventSummary;
  readonly title: string;
  /** "3:45 – 5:15 PM" in the venue's time zone. */
  readonly timeRange: string;
  /** "Today", "Tomorrow", "Sat, Nov 28". */
  readonly day: string;
  /** "Sunset Beach Club · Court 4". */
  readonly place: string;
  readonly state: BookingState;
  /** Words for the state: "Confirmed", "On the waitlist", "Needs you". */
  readonly stateLabel: string;
  /** "Starts in 2h 05m", or "Started" while it is on. */
  readonly countdown: string;
  readonly people: readonly string[];
  readonly timeZone: string;
}

export interface HomeWeekItem {
  readonly id: string;
  readonly kind: "booking" | "event";
  readonly bookingId?: string;
  readonly event?: EventSummary;
  readonly title: string;
  readonly when: string;
  readonly meta: string;
  /** Booked items say their state; open events say "Register" or "Full". */
  readonly badge: string;
  readonly startsAt: string;
}

export interface HomeConditions {
  readonly hour: HourlyConditions | null;
  readonly sun: SunTimes | null;
  readonly timeZone: string;
  readonly readAt?: number;
  /** For "Conditions · Sat, Nov 28" and VoiceOver. */
  readonly label: string;
}

export interface HomeRating {
  readonly value: number | null;
  readonly delta: number | null;
  /** 0 to 3 band segments from the rating's confidence. */
  readonly reliability: number;
  readonly confidence: SandRating["confidence"];
  /** "▲ +0.08 after Nov 21" style summary in words. */
  readonly summary: string;
  readonly form: readonly ("W" | "L")[];
}

export interface HomeModel {
  readonly firstName: string;
  readonly initials: string;
  readonly greeting: string;
  /** "Thu, Nov 26 · South Bay". */
  readonly dateLine: string;
  readonly nextUp: HomeNextUp | null;
  readonly conditions: HomeConditions | null;
  readonly week: readonly HomeWeekItem[];
  readonly needsYou: readonly HomeWeekItem[];
  readonly rating: HomeRating;
}

export interface HomeInput {
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly initials: string;
    readonly rating: SandRating;
  };
  readonly bookings: readonly BookingSummary[];
  readonly events: readonly EventSummary[];
  readonly recentMatches: readonly {
    readonly playedAt: string;
    readonly winner?: "A" | "B" | string;
    readonly teamA: readonly { readonly id: string }[];
    readonly teamB: readonly { readonly id: string }[];
    readonly ratingDelta: number;
  }[];
  /** A place name for the date line (club or region), when known. */
  readonly region?: string;
  readonly now: number;
  /** The device's time zone, for the greeting and the date line. */
  readonly timeZone: string;
  readonly locale?: string;
}

const STATE_LABELS: Readonly<Record<BookingState, string>> = {
  confirmed: "Confirmed",
  waitlisted: "On the waitlist",
  "needs-action": "Needs you",
};

/** "Good morning" before noon, "Good afternoon" to 5 PM, then "Good evening". */
export function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const RELIABILITY: Readonly<Record<SandRating["confidence"], number>> = {
  Provisional: 1,
  Developing: 2,
  Reliable: 3,
  Locked: 3,
};

function dayLabel(
  startsAt: number,
  now: number,
  timeZone: string,
  locale: string,
): string {
  const start = zonedParts(startsAt, timeZone);
  const today = zonedParts(now, timeZone);
  const startDay = Date.UTC(start.year, start.month - 1, start.day);
  const todayDay = Date.UTC(today.year, today.month - 1, today.day);
  const distance = Math.round((startDay - todayDay) / 86_400_000);
  if (distance === 0) return "Today";
  if (distance === 1) return "Tomorrow";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(startsAt));
}

function timeRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
  locale: string,
): string {
  return formatTimeRange(Date.parse(startsAt), Date.parse(endsAt), {
    locale,
    timeZone,
  }).text;
}

function countdownText(startsAt: number, endsAt: number, now: number): string {
  if (now >= startsAt && now < endsAt) return "On now";
  const parts = countdownParts(startsAt, now);
  if (parts.direction === "now") return "Starting now";
  return `Starts ${formatCountdown(parts)}`;
}

function coordinates(
  booking: BookingSummary | undefined,
  event: EventSummary | undefined,
): { latitude: number; longitude: number } | null {
  const latitude =
    event?.weather?.latitude ??
    event?.location?.latitude ??
    booking?.location?.latitude;
  const longitude =
    event?.weather?.longitude ??
    event?.location?.longitude ??
    booking?.location?.longitude;
  return latitude === undefined || longitude === undefined
    ? null
    : { latitude, longitude };
}

/**
 * Conditions at a time and place: the hourly forecast closest to it (when
 * the event carries one) and the sun times computed for that date. Nothing
 * is invented: with no forecast the line says so and still gives the sunset
 * when the place is known.
 */
export function conditionsAt(
  at: number,
  timeZone: string,
  booking: BookingSummary | undefined,
  event: EventSummary | undefined,
  locale: string,
): HomeConditions {
  const forecast = event?.weather;
  const point = forecast?.hourly
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - at) -
        Math.abs(Date.parse(right.startsAt) - at),
    )[0];
  const usable =
    point && Math.abs(Date.parse(point.startsAt) - at) <= 3 * 3_600_000
      ? point
      : undefined;
  const place = coordinates(booking, event);
  const date = zonedParts(at, timeZone);
  const sun = place
    ? sunTimes(place.latitude, place.longitude, {
        year: date.year,
        month: date.month,
        day: date.day,
      })
    : null;
  const hour: HourlyConditions | null = usable
    ? {
        at,
        ...(usable.temperatureC !== undefined
          ? { temperatureC: usable.temperatureC }
          : {}),
        ...(usable.windSpeedKph !== undefined
          ? { windSpeedKph: usable.windSpeedKph }
          : {}),
        ...(usable.windGustKph !== undefined
          ? { windGustKph: usable.windGustKph }
          : {}),
        ...(usable.precipitationProbability !== undefined
          ? { precipChancePct: usable.precipitationProbability }
          : {}),
      }
    : null;
  return {
    hour,
    sun,
    timeZone,
    ...(forecast ? { readAt: Date.parse(forecast.fetchedAt) } : {}),
    label: `Conditions · ${new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }).format(new Date(at))}`,
  };
}

export function ratingSnapshot(
  rating: SandRating,
  matches: HomeInput["recentMatches"],
  playerId: string,
): HomeRating {
  const provisional = rating.confidence === "Provisional";
  const delta = rating.delta ?? null;
  const form = matches.slice(0, 5).map((match) => {
    const onA = match.teamA.some((person) => person.id === playerId);
    const won = match.winner === (onA ? "A" : "B");
    return won ? ("W" as const) : ("L" as const);
  });
  const summary = provisional
    ? "Provisional: a few more confirmed results settle it"
    : delta === null || delta === 0
      ? "Steady since your last result"
      : `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta).toFixed(2)} since your last result`;
  return {
    value: provisional ? null : rating.display,
    delta,
    reliability: RELIABILITY[rating.confidence],
    confidence: rating.confidence,
    summary,
    form,
  };
}

export function buildHomeModel(input: HomeInput): HomeModel {
  const locale = input.locale ?? "en-US";
  const { now, player } = input;
  const local = zonedParts(now, input.timeZone);
  const firstName = player.displayName.split(/\s+/)[0] ?? player.displayName;

  // Next up: future bookings only, soonest first.
  const futureBookings = input.bookings
    .filter((booking) => new Date(booking.endsAt).getTime() > now)
    .slice()
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
  const next = futureBookings[0];
  let nextUp: HomeNextUp | null = null;
  let conditions: HomeConditions | null = null;
  if (next) {
    const event = linkedHomeEvent(next, input.events);
    const timeZone = event?.timezone ?? next.venueTimezone ?? input.timeZone;
    const start = Date.parse(next.startsAt);
    nextUp = {
      bookingId: next.id,
      ...(event ? { event } : {}),
      title: next.title,
      timeRange: timeRange(next.startsAt, next.endsAt, timeZone, locale),
      day: dayLabel(start, now, timeZone, locale),
      place: [
        event?.organizationName ?? next.organization?.name,
        next.court?.name ?? next.venueName,
      ]
        .filter(Boolean)
        .join(" · "),
      state: next.status,
      stateLabel: STATE_LABELS[next.status],
      countdown: countdownText(start, Date.parse(next.endsAt), now),
      people: next.participantNames.filter(
        (name) => name !== player.displayName,
      ),
      timeZone,
    };
    conditions = conditionsAt(start, timeZone, next, event, locale);
  }

  const bookedEventIds = new Set(
    futureBookings.flatMap((booking) =>
      [booking.sessionId, linkedHomeEvent(booking, input.events)?.id].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  const bookingItems: HomeWeekItem[] = futureBookings.map((booking) => {
    const event = linkedHomeEvent(booking, input.events);
    const timeZone = event?.timezone ?? booking.venueTimezone ?? input.timeZone;
    const start = Date.parse(booking.startsAt);
    return {
      id: `booking:${booking.id}`,
      kind: "booking",
      bookingId: booking.id,
      ...(event ? { event } : {}),
      title: booking.title,
      when: `${dayLabel(start, now, timeZone, locale)} · ${timeRange(booking.startsAt, booking.endsAt, timeZone, locale)}`,
      meta: [event?.organizationName, booking.venueName]
        .filter(Boolean)
        .join(" · "),
      badge: STATE_LABELS[booking.status],
      startsAt: booking.startsAt,
    };
  });
  const openEvents: HomeWeekItem[] = input.events
    .filter(
      (event) =>
        new Date(event.endsAt).getTime() > now &&
        event.lifecycleStatus !== "cancelled" &&
        !["pickup", "open-play"].includes(event.kind) &&
        !bookedEventIds.has(event.id),
    )
    .map((event) => {
      const start = Date.parse(event.startsAt);
      return {
        id: `event:${event.id}`,
        kind: "event",
        event,
        title: event.title,
        when: `${dayLabel(start, now, event.timezone, locale)} · ${timeRange(event.startsAt, event.endsAt, event.timezone, locale)}`,
        meta: [event.organizationName, event.venueName]
          .filter(Boolean)
          .join(" · "),
        badge: event.spotsRemaining > 0 ? "Register" : "Full",
        startsAt: event.startsAt,
      };
    });
  const week = [...bookingItems.slice(1), ...openEvents]
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .slice(0, 6);
  const needsYou = bookingItems.filter(
    (item) => item.badge === STATE_LABELS["needs-action"],
  );

  const dateLine = [
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: input.timeZone,
    }).format(new Date(now)),
    input.region,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    firstName,
    initials: player.initials,
    greeting: `${greetingFor(local.hour)}, ${firstName}`,
    dateLine,
    nextUp,
    conditions,
    week,
    needsYou,
    rating: ratingSnapshot(player.rating, input.recentMatches, player.id),
  };
}

const PREVIEW_TIME_ZONE = "America/Los_Angeles";
/** Demo items keep fixed wall-clock times so the preview always has a future. */
const PREVIEW_WINDOWS: Readonly<
  Record<
    string,
    readonly [dayOffset: number, hour: number, minute: number, minutes: number]
  >
> = {
  "event-pickup": [0, 18, 0, 90],
  "event-open-play": [0, 19, 30, 90],
  "event-clinic": [2, 16, 30, 90],
  "event-summer-series": [7, 18, 0, 180],
  "event-live-open": [18, 8, 0, 480],
  "booking-pickup": [0, 18, 0, 90],
  "booking-clinic": [2, 16, 30, 90],
  "booking-league": [7, 18, 0, 180],
};

/** The instant a venue wall-clock time happens (two passes settle DST). */
function wallTime(
  now: number,
  dayOffset: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const today = zonedParts(now, timeZone);
  const target = Date.UTC(
    today.year,
    today.month - 1,
    today.day + dayOffset,
    hour,
    minute,
  );
  let instant = target;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = zonedParts(instant, timeZone);
    instant +=
      target -
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
      );
  }
  return instant;
}

/**
 * Preview builds only: moves the demo bookings and events to fixed times
 * around `now` (today's evening game rolls to tomorrow once it has started),
 * so Home always shows a real "Next up" without inventing new data.
 */
export function shiftPreviewSchedule<
  Item extends {
    readonly id: string;
    readonly startsAt: string;
    readonly endsAt: string;
  },
>(items: readonly Item[], now: number): Item[] {
  return items.map((item) => {
    const window = PREVIEW_WINDOWS[item.id];
    if (!window) return item;
    const [dayOffset, hour, minute, minutes] = window;
    let start = wallTime(now, dayOffset, hour, minute, PREVIEW_TIME_ZONE);
    if (dayOffset === 0 && start <= now) {
      start = wallTime(now, 1, hour, minute, PREVIEW_TIME_ZONE);
    }
    return {
      ...item,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + minutes * 60_000).toISOString(),
    };
  });
}
