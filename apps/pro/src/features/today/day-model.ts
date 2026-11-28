/**
 * The coach's day (M-R0 Today and Schedule), derived from what the Pro
 * runtime already loads: the operator workspace (calendar entries, venues
 * with their forecast and courts), the scorable matches, and the
 * participation "at risk" list (`operator.participation.atRisk`). No new
 * queries beyond that one. Pure and unit-tested (`day-model.test.ts`).
 *
 * Words for group minimums come from `@duna/core` participation copy, so
 * Pro says exactly what HQ and the Player say ("Needs 2 more").
 */
import { participationToken, renderParticipationCopy } from "@duna/core";
import {
  formatTime,
  formatTimeRange,
  lightMarkFor,
  localDateOf,
  sunTimes,
  zonedParts,
  type HourlyConditions,
  type LightMark,
  type SunTimes,
} from "@duna/tideline-core";

export interface DayAttendee {
  readonly displayName: string;
  readonly status: string;
  readonly attendanceStatus?:
    "scheduled" | "attended" | "no-show" | "cancelled";
}

/** A calendar entry (`operator.workspace` → `calendar.entries`). */
export interface DayEntryInput {
  readonly id: string;
  readonly sourceType:
    "session" | "booking" | "pickup" | "busy-block" | "operator-block";
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: string;
  readonly kind?: string;
  readonly venueId?: string;
  readonly venueName?: string;
  readonly courtId?: string;
  readonly courtName?: string;
  readonly coachName?: string;
  readonly participantCount: number;
  readonly capacity: number;
  readonly attendees: readonly DayAttendee[];
}

export interface DayForecastPoint {
  readonly startsAt: string;
  readonly temperatureC?: number;
  readonly windSpeedKph?: number;
  readonly windGustKph?: number;
  readonly windFromDeg?: number;
  readonly precipitationProbability?: number;
}

/** A venue (`operator.workspace` → `venues`). */
export interface DayVenueInput {
  readonly id: string;
  readonly name: string;
  readonly locality?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly weather?: {
    readonly fetchedAt: string;
    readonly hourly: readonly DayForecastPoint[];
  };
  readonly courts: readonly { readonly id: string; readonly lit: boolean }[];
}

/** A scorable match (`operator.scorableMatches`). */
export interface DayMatchInput {
  readonly id: string;
  readonly status: string;
  readonly scheduledAt?: string;
  readonly venueName?: string;
  readonly courtName?: string;
  readonly sessionTitle?: string;
  readonly divisionName?: string;
  readonly teamA: { readonly name: string };
  readonly teamB: { readonly name: string };
}

/** A session under its minimum (`operator.participation.atRisk`). */
export interface DayAtRiskInput {
  readonly subjectId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly booked: number;
  readonly min: number;
  readonly capacity: number;
  readonly lockAt: string;
  readonly displayState: string;
}

export type EntryState =
  "live" | "next" | "later" | "done" | "busy" | "cancelled";

/** What an agenda row needs from the coach, in words. */
export interface EntryNeed {
  readonly kind: "attendance" | "minimum";
  readonly label: string;
}

export interface AgendaItem {
  readonly id: string;
  readonly title: string;
  readonly startsAt: number;
  readonly endsAt: number;
  /** "4:30 PM". */
  readonly time: string;
  /** "4:30 – 6:00 PM". */
  readonly timeRange: string;
  readonly minutes: number;
  readonly state: EntryState;
  /** "Courts 1–2 · 7 of 9". */
  readonly meta: string;
  readonly place: string;
  readonly court: string | null;
  readonly coach: string | null;
  /** "7 of 9 coming"; null for blocks and bookings without a roster. */
  readonly coming: string | null;
  readonly people: readonly string[];
  readonly needs: readonly EntryNeed[];
  /** The light at the start time (court lights count). */
  readonly light: LightMark | null;
  readonly busy: boolean;
  /** Group messaging key ("event:…" or "rental:…"). */
  readonly audienceKey: string | null;
}

export interface DayConditions {
  readonly hour: HourlyConditions | null;
  readonly sun: SunTimes | null;
  readonly readAt?: number;
  readonly timeZone: string;
  readonly courtIsLit: boolean;
  readonly venueName: string;
  /** "Conditions · Wed, Nov 25". */
  readonly label: string;
  /** The venue has no forecast at all (not set up, or no coordinates). */
  readonly configured: boolean;
  /** The next hours of the forecast for the sheet. */
  readonly hours: readonly HourlyConditions[];
}

export interface CourtMatch {
  readonly id: string;
  readonly live: boolean;
  readonly title: string;
  readonly court: string;
  /** "Live" or "4:30 PM". */
  readonly when: string;
  readonly context: string;
}

export interface NeedsYouItem {
  readonly id: string;
  readonly kind: "minimum" | "attendance" | "unpaid";
  readonly title: string;
  readonly summary: string;
  readonly action: string;
  readonly entryId?: string;
}

export interface DayModel {
  readonly dateKey: string;
  /** "Wednesday, November 25". */
  readonly dateLine: string;
  readonly agenda: readonly AgendaItem[];
  /** The live session, else the one that just ended (notes), else the next. */
  readonly focus: AgendaItem | null;
  readonly focusReason: "live" | "just-ended" | "next" | null;
  readonly later: readonly AgendaItem[];
  readonly matches: readonly CourtMatch[];
  readonly needsYou: readonly NeedsYouItem[];
  readonly conditions: DayConditions | null;
  /** Sessions ran today and nothing is left: the day-complete card. */
  readonly complete: {
    readonly sessions: number;
    readonly checkedIn: number;
    readonly toMark: number;
  } | null;
  readonly sessionCount: number;
}

const ATTENDING = new Set([
  "confirmed",
  "paid",
  "accepted",
  "checked-in",
  "organizer",
]);
const JUST_ENDED_MS = 2 * 60 * 60_000;

/** The local calendar day of an instant in a zone, "2026-11-25". */
export function dateKeyOf(instant: number, timeZone: string): string {
  return localDateOf(instant, timeZone);
}

export function entryState(entry: DayEntryInput, now: number): EntryState {
  if (
    entry.sourceType === "busy-block" ||
    entry.sourceType === "operator-block"
  )
    return "busy";
  if (/cancel/i.test(entry.status)) return "cancelled";
  const start = Date.parse(entry.startsAt);
  const end = Date.parse(entry.endsAt);
  if (start <= now && end > now) return "live";
  if (end <= now) return "done";
  return "later";
}

/** People on the roster who still need attendance marked after it ended. */
export function attendanceToMark(entry: DayEntryInput, now: number): number {
  if (Date.parse(entry.endsAt) > now) return 0;
  return entry.attendees.filter(
    (attendee) =>
      ATTENDING.has(attendee.status) &&
      (attendee.attendanceStatus === undefined ||
        attendee.attendanceStatus === "scheduled"),
  ).length;
}

/** "Needs 2 more" from the shared participation copy. */
export function needsMoreLabel(booked: number, min: number): string | null {
  const needed = Math.max(0, min - booked);
  if (needed === 0) return null;
  return renderParticipationCopy(
    participationToken("status.needs", { n: needed }),
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function sunFor(
  venue: DayVenueInput | undefined,
  instant: number,
  timeZone: string,
): SunTimes | null {
  if (venue?.latitude === undefined || venue.longitude === undefined)
    return null;
  const date = zonedParts(instant, timeZone);
  return sunTimes(venue.latitude, venue.longitude, {
    year: date.year,
    month: date.month,
    day: date.day,
  });
}

function hourOf(point: DayForecastPoint, at: number): HourlyConditions {
  return {
    at,
    ...(point.temperatureC !== undefined
      ? { temperatureC: point.temperatureC }
      : {}),
    ...(point.windSpeedKph !== undefined
      ? { windSpeedKph: point.windSpeedKph }
      : {}),
    ...(point.windGustKph !== undefined
      ? { windGustKph: point.windGustKph }
      : {}),
    ...(point.windFromDeg !== undefined
      ? { windFromDeg: point.windFromDeg }
      : {}),
    ...(point.precipitationProbability !== undefined
      ? { precipChancePct: point.precipitationProbability }
      : {}),
  };
}

/**
 * Conditions at a venue for an instant: the forecast hour closest to it
 * (within three hours), the sun for that local date, whether any court there
 * is lit, and the next hours for the full sheet. Nothing is invented: with no
 * forecast the line says so and the sheet still gives the sun times.
 */
export function conditionsAt(
  venue: DayVenueInput | undefined,
  at: number,
  timeZone: string,
  locale = "en-US",
): DayConditions | null {
  if (!venue) return null;
  const points = venue.weather?.hourly ?? [];
  const closest = points
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - at) -
        Math.abs(Date.parse(right.startsAt) - at),
    )[0];
  const usable =
    closest && Math.abs(Date.parse(closest.startsAt) - at) <= 3 * 3_600_000
      ? closest
      : undefined;
  const hours = points
    .filter((point) => Date.parse(point.startsAt) >= at - 3_600_000)
    .slice(0, 8)
    .map((point) => hourOf(point, Date.parse(point.startsAt)));
  return {
    hour: usable ? hourOf(usable, at) : null,
    sun: sunFor(venue, at, timeZone),
    ...(venue.weather ? { readAt: Date.parse(venue.weather.fetchedAt) } : {}),
    timeZone,
    courtIsLit: venue.courts.some((court) => court.lit),
    venueName: venue.name,
    configured: Boolean(venue.weather),
    hours,
    label: `Conditions · ${new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }).format(new Date(at))}`,
  };
}

/** The venue a day is about: the next session's, else the first with a forecast. */
export function dayVenue(
  venues: readonly DayVenueInput[],
  agenda: readonly AgendaItem[],
  entries: readonly DayEntryInput[],
): DayVenueInput | undefined {
  const upcoming = agenda.find(
    (item) => item.state === "live" || item.state === "later",
  );
  const venueId = entries.find((entry) => entry.id === upcoming?.id)?.venueId;
  return (
    venues.find((venue) => venue.id === venueId) ??
    venues.find((venue) => venue.weather) ??
    venues[0]
  );
}

export function agendaItem(
  entry: DayEntryInput,
  input: {
    readonly now: number;
    readonly timeZone: string;
    readonly locale: string;
    readonly venues: readonly DayVenueInput[];
    readonly atRisk: readonly DayAtRiskInput[];
  },
): AgendaItem {
  const start = Date.parse(entry.startsAt);
  const end = Date.parse(entry.endsAt);
  const state = entryState(entry, input.now);
  const busy = state === "busy";
  const options = { locale: input.locale, timeZone: input.timeZone };
  const venue = input.venues.find(
    (candidate) => candidate.id === entry.venueId,
  );
  const court = venue?.courts.find(
    (candidate) => candidate.id === entry.courtId,
  );
  const sun = sunFor(venue, start, input.timeZone);
  const light = sun
    ? lightMarkFor(start, { sun, courtIsLit: court?.lit ?? false })
    : null;
  const hasRoster = !busy && entry.capacity > 0;
  const coming = hasRoster
    ? `${entry.participantCount} of ${entry.capacity} coming`
    : null;
  const needs: EntryNeed[] = [];
  const toMark = attendanceToMark(entry, input.now);
  if (!busy && toMark > 0)
    needs.push({ kind: "attendance", label: "Mark attendance" });
  const risk = input.atRisk.find((item) => item.subjectId === entry.id);
  const short = risk ? needsMoreLabel(risk.booked, risk.min) : null;
  if (short && state !== "done") needs.push({ kind: "minimum", label: short });
  const place = [entry.venueName, entry.courtName].filter(Boolean).join(" · ");
  const meta = busy
    ? "Blocked time"
    : [
        entry.courtName ?? entry.venueName,
        hasRoster ? `${entry.participantCount} of ${entry.capacity}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return {
    id: entry.id,
    title: busy ? entry.title || "Busy" : entry.title,
    startsAt: start,
    endsAt: end,
    time: formatTime(start, options),
    timeRange: formatTimeRange(start, end, options).text,
    minutes: Math.max(0, Math.round((end - start) / 60_000)),
    state,
    meta,
    place,
    court: entry.courtName ?? null,
    coach: entry.coachName ?? null,
    coming,
    people: entry.attendees
      .filter((attendee) => ATTENDING.has(attendee.status))
      .map((attendee) => attendee.displayName),
    needs,
    light,
    busy,
    audienceKey:
      busy || entry.sourceType === "pickup"
        ? null
        : entry.sourceType === "booking"
          ? `rental:${entry.id}`
          : `event:${entry.id}`,
  };
}

/** The agenda for one local day, by start time. */
export function agendaFor(
  entries: readonly DayEntryInput[],
  dateKey: string,
  input: Parameters<typeof agendaItem>[1],
): readonly AgendaItem[] {
  return entries
    .filter(
      (entry) =>
        dateKeyOf(Date.parse(entry.startsAt), input.timeZone) === dateKey,
    )
    .slice()
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .map((entry) => agendaItem(entry, input));
}

export type AgendaView = "agenda" | "court" | "coach";

export interface AgendaGroup {
  readonly key: string;
  readonly title: string | null;
  readonly meta: string | null;
  readonly items: readonly AgendaItem[];
}

/** The Schedule views (board P04-Schedule: Agenda · By court · By coach). */
export function groupAgenda(
  agenda: readonly AgendaItem[],
  view: AgendaView,
): readonly AgendaGroup[] {
  if (view === "agenda")
    return [{ key: "all", title: null, meta: null, items: agenda }];
  const groups = new Map<string, AgendaItem[]>();
  for (const item of agenda) {
    if (item.busy && view === "court") continue;
    const key =
      view === "court"
        ? (item.court ?? "Court to be assigned")
        : (item.coach ?? (item.busy ? "You" : "Coach to be assigned"));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) =>
      left.localeCompare(right, "en-US", { numeric: true }),
    )
    .map(([key, items]) => ({
      key,
      title: key,
      meta: plural(items.filter((item) => !item.busy).length, "session"),
      items,
    }));
}

export function courtMatches(
  matches: readonly DayMatchInput[],
  dateKey: string,
  timeZone: string,
  locale: string,
): readonly CourtMatch[] {
  return matches
    .filter(
      (match) =>
        match.status === "live" ||
        !match.scheduledAt ||
        dateKeyOf(Date.parse(match.scheduledAt), timeZone) === dateKey,
    )
    .filter((match) => !/complete|final|cancel/i.test(match.status))
    .slice()
    .sort((left, right) => {
      if ((left.status === "live") !== (right.status === "live"))
        return left.status === "live" ? -1 : 1;
      return (
        Date.parse(left.scheduledAt ?? "") - Date.parse(right.scheduledAt ?? "")
      );
    })
    .map((match) => ({
      id: match.id,
      live: match.status === "live",
      title: `${match.teamA.name} v ${match.teamB.name}`,
      court: match.courtName ?? "Court to be assigned",
      when:
        match.status === "live"
          ? "Live"
          : match.scheduledAt
            ? formatTime(Date.parse(match.scheduledAt), { locale, timeZone })
            : "Time to be set",
      context: [match.sessionTitle, match.divisionName]
        .filter(Boolean)
        .join(" · "),
    }));
}

export interface DayModelInput {
  readonly entries: readonly DayEntryInput[];
  readonly venues: readonly DayVenueInput[];
  readonly matches: readonly DayMatchInput[];
  readonly atRisk: readonly DayAtRiskInput[];
  /** People whose payment is still pending, per session id. */
  readonly unpaidBySession?: Readonly<Record<string, number>>;
  readonly now: number;
  readonly timeZone: string;
  readonly locale?: string;
  /** The day to build (default: today in `timeZone`). */
  readonly dateKey?: string;
}

export function buildDayModel(input: DayModelInput): DayModel {
  const locale = input.locale ?? "en-US";
  const todayKey = dateKeyOf(input.now, input.timeZone);
  const dateKey = input.dateKey ?? todayKey;
  const agenda = agendaFor(input.entries, dateKey, {
    now: input.now,
    timeZone: input.timeZone,
    locale,
    venues: input.venues,
    atRisk: input.atRisk,
  });
  const sessions = agenda.filter(
    (item) => !item.busy && item.state !== "cancelled",
  );
  const live = sessions.find((item) => item.state === "live");
  const justEnded = [...sessions]
    .reverse()
    .find(
      (item) =>
        item.state === "done" && input.now - item.endsAt < JUST_ENDED_MS,
    );
  const next = sessions.find((item) => item.state === "later");
  const focus = live ?? justEnded ?? next ?? null;
  const focusReason = live
    ? "live"
    : justEnded
      ? "just-ended"
      : next
        ? "next"
        : null;
  // "Up next" is about the coming one: mark it so its row reads as next.
  const nextId = next?.id;
  const marked = agenda.map((item) =>
    item.id === nextId ? { ...item, state: "next" as const } : item,
  );
  const later = marked.filter(
    (item) =>
      item.id !== focus?.id &&
      (item.state === "next" || item.state === "later"),
  );

  const needsYou: NeedsYouItem[] = [];
  for (const risk of input.atRisk) {
    const label = needsMoreLabel(risk.booked, risk.min);
    if (!label) continue;
    const when = formatTime(Date.parse(risk.startsAt), {
      locale,
      timeZone: input.timeZone,
    });
    const lock = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: input.timeZone,
    }).format(new Date(risk.lockAt));
    needsYou.push({
      id: `minimum:${risk.subjectId}`,
      kind: "minimum",
      title: `${risk.title}: ${label.toLowerCase()}`,
      summary: `${new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: input.timeZone,
      }).format(
        new Date(risk.startsAt),
      )} ${when} · ${risk.booked} of ${risk.min} booked · decides ${lock}`,
      action: "Review",
      entryId: risk.subjectId,
    });
  }
  for (const item of marked) {
    if (!item.needs.some((need) => need.kind === "attendance")) continue;
    needsYou.push({
      id: `attendance:${item.id}`,
      kind: "attendance",
      title: `Mark attendance · ${item.title}`,
      summary: `Ended ${formatTime(item.endsAt, { locale, timeZone: input.timeZone })} · ${item.place || "your courts"}`,
      action: "Mark",
      entryId: item.id,
    });
  }
  for (const item of marked) {
    const unpaid = input.unpaidBySession?.[item.id] ?? 0;
    if (unpaid <= 0 || item.state === "done") continue;
    needsYou.push({
      id: `unpaid:${item.id}`,
      kind: "unpaid",
      title: `${plural(unpaid, "player")} not paid · ${item.title}`,
      summary: `${item.time} · ${item.place || "your courts"}`,
      action: "Collect",
      entryId: item.id,
    });
  }

  const remaining = sessions.some(
    (item) => item.state === "live" || item.state === "later",
  );
  const complete =
    dateKey === todayKey && sessions.length > 0 && !remaining
      ? {
          sessions: sessions.length,
          checkedIn: input.entries
            .filter((entry) => sessions.some((item) => item.id === entry.id))
            .flatMap((entry) => entry.attendees)
            .filter(
              (attendee) =>
                attendee.status === "checked-in" ||
                attendee.attendanceStatus === "attended",
            ).length,
          toMark: sessions.filter((item) =>
            item.needs.some((need) => need.kind === "attendance"),
          ).length,
        }
      : null;

  const venue = dayVenue(input.venues, agenda, input.entries);
  const dayStart = Date.parse(`${dateKey}T12:00:00Z`);
  const at =
    dateKey === todayKey
      ? focus?.startsAt && focus.startsAt > input.now
        ? focus.startsAt
        : input.now
      : (sessions[0]?.startsAt ?? dayStart);
  return {
    dateKey,
    dateLine: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: input.timeZone,
    }).format(new Date(dateKey === todayKey ? input.now : dayStart)),
    agenda: marked,
    focus: focus
      ? (marked.find((item) => item.id === focus.id) ?? focus)
      : null,
    focusReason,
    later,
    matches: courtMatches(input.matches, dateKey, input.timeZone, locale),
    needsYou,
    conditions: conditionsAt(venue, at, input.timeZone, locale),
    complete,
    sessionCount: sessions.length,
  };
}
