import type { PublicProCoverage } from "@duna/api";
import { instantIsoDay } from "@/lib/date-filter";

/**
 * Pure helpers for the Pro Tour pages: the tour filter, the week, event
 * shelves and match states, read from the existing `public.proCoverage`
 * feed. Nothing is invented: a match is live only when the feed says so.
 */

export type ProEvent = PublicProCoverage["events"][number];
export type ProMatch = PublicProCoverage["matches"][number];
export type ProTourFilter = "all" | "elite" | "challenger" | "futures" | "avp";

export const tourFilters: ReadonlyArray<{
  readonly value: ProTourFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All tours" },
  { value: "elite", label: "Elite" },
  { value: "challenger", label: "Challenger" },
  { value: "futures", label: "Futures" },
  { value: "avp", label: "AVP" },
];

export function parseTour(value: string | undefined): ProTourFilter {
  return tourFilters.some((filter) => filter.value === value)
    ? (value as ProTourFilter)
    : "all";
}

/** `/pro?tour=…&date=…`, keeping the other filter. */
export function proHref(tour: ProTourFilter, date?: string): string {
  const parameters = new URLSearchParams();
  if (tour !== "all") parameters.set("tour", tour);
  if (date) parameters.set("date", date);
  const query = parameters.toString();
  return query ? `/pro?${query}` : "/pro";
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday to Sunday of the week `now` is in (UTC days). */
export function currentWeek(now = new Date()) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return isoDay(day);
  });
  return { start: days[0]!, end: days[6]!, days };
}

export function eventOverlaps(event: ProEvent, date: string): boolean {
  const start = event.startsOn ?? event.endsOn;
  const end = event.endsOn ?? event.startsOn;
  return Boolean(start && end && start <= date && end >= date);
}

export function dayLabel(date: string, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat("en-US", {
    ...(style === "long"
      ? { month: "long", day: "numeric", year: "numeric" }
      : { weekday: "short", day: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function eventDates(start?: string, end?: string): string {
  if (!start) return "Dates to be announced";
  const format = (value: string, withYear: boolean) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  if (!end || end === start) return format(start, true);
  return `${format(start, start.slice(0, 4) !== end.slice(0, 4))} – ${format(end, true)}`;
}

/** The three shelves the tour page shows, or one shelf for a chosen day. */
export function eventShelves(
  coverage: PublicProCoverage | undefined,
  tour: ProTourFilter,
  date: string | undefined,
  now = new Date(),
) {
  const tourEvents = (coverage?.events ?? []).filter(
    (event) => tour === "all" || event.tour === tour,
  );
  const visible = date
    ? tourEvents.filter((event) => eventOverlaps(event, date))
    : tourEvents;
  const week = currentWeek(now);
  const live = visible.filter((event) => event.live);
  const thisWeek = visible.filter(
    (event) =>
      !event.live &&
      event.status !== "completed" &&
      Boolean(
        event.startsOn &&
        event.endsOn &&
        event.startsOn <= week.end &&
        event.endsOn >= week.start,
      ),
  );
  const coming = visible
    .filter(
      (event) =>
        event.status === "upcoming" &&
        !thisWeek.some((candidate) => candidate.id === event.id),
    )
    .slice(0, 12);
  return { tourEvents, visible, live, thisWeek, coming, week };
}

/** Matches with a page, for the tour and the day chosen, newest first. */
export function visibleMatches(
  coverage: PublicProCoverage | undefined,
  tour: ProTourFilter,
  date: string | undefined,
  limit = 20,
): ProMatch[] {
  return (coverage?.matches ?? [])
    .filter(
      (match) =>
        match.canonicalPath &&
        (tour === "all" || match.tour === tour) &&
        (!date || (match.playedAt && instantIsoDay(match.playedAt) === date)),
    )
    .slice(0, limit);
}

/**
 * The match the hero shows: a genuinely live one when the feed has one,
 * otherwise the next scheduled match, never an invented score.
 */
export function heroMatch(
  coverage: PublicProCoverage | undefined,
  now = new Date(),
): ProMatch | undefined {
  const matches = (coverage?.matches ?? []).filter(
    (match) => match.canonicalPath,
  );
  const live = matches.find((match) => match.status === "live");
  if (live) return live;
  return matches
    .filter(
      (match) =>
        match.status === "scheduled" &&
        match.scheduledAt &&
        Date.parse(match.scheduledAt) >= now.getTime(),
    )
    .sort(
      (left, right) =>
        Date.parse(left.scheduledAt!) - Date.parse(right.scheduledAt!),
    )[0];
}

/** The NetScore state for a feed status ("completed" is the kit's "complete"). */
export function netScoreStatus(
  status: ProMatch["status"],
): "live" | "complete" | "scheduled" {
  if (status === "live") return "live";
  if (status === "completed") return "complete";
  return "scheduled";
}

export function matchStart(match: ProMatch): string | undefined {
  const value = match.scheduledAt ?? match.playedAt;
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function matchSets(match: ProMatch): Array<[number, number]> {
  return (match.sets ?? []).map((set) => [set.a, set.b]);
}
