/**
 * Find a game: from the discovery feed to rows a player can read at a
 * glance (SITE-4). Pure and deterministic: callers pass `now`, so the server
 * renders the first results and the tests pin every rule.
 *
 * Every row answers "can I play there, then, and what will it cost": what,
 * where (and how far when there is a point to measure from), when (in the
 * game's own time zone), level, the price all-in, the group state in the
 * shared participation words, and the light at that hour computed from the
 * sun (weather is not in the feed: Needs API). Sessions are grouped by day,
 * then time; courts, clubs and coaches (which have no time) follow.
 */
import type { DiscoveryMapItem, VenueSummary } from "@duna/api";
import { formatMoney } from "@duna/core";
import {
  participationDisplay,
  renderParticipationCopy,
  type ParticipationTone,
} from "@duna/core";
import { priceConsumerOrder, type OrderItemKind } from "@duna/pricing";
import {
  lightMarkFor,
  localDateOf,
  parseIsoDate,
  sunTimes,
  weekdayOf,
  zonedParts,
} from "@duna/tideline-core";
import { fuzzyScore, normalizeText } from "../site/search/fuzzy";
import {
  AFTERNOON_FROM_MINUTE,
  type DiscoverState,
  type DiscoverWhere,
  EVENING_FROM_MINUTE,
  presetDates,
  RADIUS_STEPS_MILES,
  TONIGHT_FROM_MINUTE,
  type WhatId,
  whereLabel,
} from "./search-state";

export type ResultKind =
  | "open"
  | "clinic"
  | "league"
  | "tournament"
  | "event"
  | "court"
  | "coach"
  | "club"
  | "pro";

export interface ResultRow {
  readonly id: string;
  readonly kind: ResultKind;
  /** The taxonomy chip: "Open play", "Clinic", "Courts". */
  readonly kindLabel: string;
  readonly title: string;
  readonly href: string;
  /** Where, in words: the venue or club, or the city. */
  readonly place: string;
  readonly latitude?: number;
  readonly longitude?: number;
  /** Miles from the searched point, when there is one. */
  readonly distance?: string;
  readonly distanceMiles?: number;
  /** The game's local date (YYYY-MM-DD) and time words, for sessions. */
  readonly localDate?: string;
  readonly time?: string;
  /** Machine-readable start, for <time>. */
  readonly startsAt?: string;
  readonly multiDay?: string;
  readonly timeZone?: string;
  readonly level?: string;
  readonly price?: { readonly label: string; readonly detail: string };
  /** The group state in the shared participation words ("3 spots left"). */
  readonly group?: { readonly words: string; readonly tone: ParticipationTone };
  /** One line of conditions where data exists (light from the sun). */
  readonly conditions?: string;
  readonly live: boolean;
  /** A real photo (club or event upload); never the event library art. */
  readonly imageUrl?: string;
  /** Places: courts, open now. */
  readonly facts?: string;
}

export interface DayGroup {
  readonly date: string;
  readonly label: string;
  readonly rows: readonly ResultRow[];
}

export interface DiscoverResults {
  readonly days: readonly DayGroup[];
  readonly places: readonly ResultRow[];
  readonly count: number;
  /** The point distances are measured from. */
  readonly origin?: { readonly latitude: number; readonly longitude: number };
  /** The area searched (miles); undefined anywhere. */
  readonly radiusMiles?: number;
  /** The radius was chosen by the search (it widens to find enough). */
  readonly radiusAutomatic: boolean;
  /** What the Where says, after free text is understood. */
  readonly whereText: string;
  /** Free text matched one of Duna's venues or towns. */
  readonly resolvedFrom?: string;
  /** With no results: the closest things that match anything, for "nearby". */
  readonly nearby: readonly ResultRow[];
}

export interface DiscoverOptions {
  readonly now: Date;
  /** Where a venue row links (the public page or the signed-in twin). */
  readonly venueHref?: (venueId: string) => string;
  /** Enough results to stop widening the area. */
  readonly enough?: number;
}

const LIBRARY_ART = "/media/event-library/";
const MILE_KM = 1.609344;
const DEFAULT_ZONE = "UTC";
/** A venue this close lends an item its time zone. */
const ZONE_RADIUS_MILES = 250;

const KIND_LABELS: Record<string, string> = {
  "open-play": "Open play",
  pickup: "Pickup",
  "hosted-match": "Open game",
  match: "Open game",
  clinic: "Clinic",
  "private-lesson": "Lesson",
  lesson: "Lesson",
  training: "Training",
  camp: "Camp",
  league: "League",
  tournament: "Tournament",
};

export function distanceMiles(
  from: { readonly latitude: number; readonly longitude: number },
  to: { readonly latitude?: number; readonly longitude?: number },
): number {
  if (to.latitude === undefined || to.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLng = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(miles: number): string {
  if (miles < 0.1) return "Here";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles).toLocaleString("en-US")} mi`;
}

/** Which kind a feed item is, for the What filter and its chip. */
export function resultKind(item: DiscoveryMapItem): ResultKind {
  const kind = item.kind.toLowerCase();
  if (item.entityType === "venue") return "court";
  if (item.entityType === "coach") return "coach";
  if (item.entityType === "organization") return "club";
  if (item.entityType === "pro-tour" || item.entityType === "match") {
    return "pro";
  }
  if (["open-play", "pickup", "hosted-match", "match"].includes(kind)) {
    return "open";
  }
  if (
    ["clinic", "private-lesson", "lesson", "training", "camp"].includes(kind)
  ) {
    return "clinic";
  }
  if (kind === "league") return "league";
  if (kind === "tournament") return "tournament";
  return "event";
}

function kindLabel(item: DiscoveryMapItem, kind: ResultKind): string {
  switch (kind) {
    case "court":
      return "Courts";
    case "coach":
      return "Coach";
    case "club":
      return "Club";
    case "pro":
      return item.entityType === "match" ? "Pro match" : "Pro Tour";
    default:
      return KIND_LABELS[item.kind.toLowerCase()] ?? "Event";
  }
}

function whatMatches(kind: ResultKind, what: readonly WhatId[]): boolean {
  if (what.length === 0) return true;
  if (kind === "pro") return what.includes("tournament");
  if (kind === "club") return false;
  return what.includes(kind);
}

/** Surface from what the club wrote about it (the feed has no field: Needs API). */
export function isIndoor(item: DiscoveryMapItem): boolean {
  return [item.title, item.subtitle, ...item.tags].some((text) =>
    /\bindoor\b/i.test(text),
  );
}

function surfaceMatches(item: DiscoveryMapItem, state: DiscoverState) {
  if (state.surface === "any") return true;
  return state.surface === "indoor" ? isIndoor(item) : !isIndoor(item);
}

/** The time zone of the nearest Duna venue (same club first), else UTC. */
export function zoneFor(
  item: Pick<DiscoveryMapItem, "latitude" | "longitude" | "organizationId">,
  venues: readonly VenueSummary[],
): string {
  const sameClub = venues.filter(
    (venue) => venue.organizationId === item.organizationId,
  );
  const pool = item.latitude === undefined ? sameClub : venues;
  let best: VenueSummary | undefined;
  let bestMiles = Number.POSITIVE_INFINITY;
  for (const venue of pool) {
    const miles =
      item.latitude === undefined
        ? 0
        : distanceMiles(venue, item) -
          (venue.organizationId === item.organizationId ? 1 : 0);
    if (miles < bestMiles) {
      best = venue;
      bestMiles = miles;
    }
  }
  if (!best) return sameClub[0]?.timezone ?? DEFAULT_ZONE;
  return bestMiles <= ZONE_RADIUS_MILES ? best.timezone : DEFAULT_ZONE;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
function formatClock(instant: number, timeZone: string) {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
function isoDayWords(date: string) {
  const parsed = parseIsoDate(date)!;
  return dayFormatter.format(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  );
}

/** "Today", "Tomorrow" or "Sat, Nov 30", relative to today at the game. */
export function dayLabel(date: string, today: string, tomorrow: string) {
  if (date === today) return `Today · ${isoDayWords(date)}`;
  if (date === tomorrow) return `Tomorrow · ${isoDayWords(date)}`;
  return isoDayWords(date);
}

function addDays(date: string, days: number) {
  const parsed = parseIsoDate(date)!;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days))
    .toISOString()
    .slice(0, 10);
}

interface Timing {
  readonly zone: string;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly startMinute?: number;
}

function timingOf(item: DiscoveryMapItem, zone: string): Timing {
  const startMs = item.startsAt ? Date.parse(item.startsAt) : Number.NaN;
  const endMs = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  if (Number.isNaN(startMs)) return { zone };
  const parts = zonedParts(startMs, zone);
  return {
    zone,
    startMs,
    ...(Number.isNaN(endMs) ? {} : { endMs }),
    startDate: localDateOf(startMs, zone),
    endDate: Number.isNaN(endMs)
      ? localDateOf(startMs, zone)
      : localDateOf(Math.max(startMs, endMs - 1), zone),
    startMinute: parts.hour * 60 + parts.minute,
  };
}

function whenMatches(timing: Timing, state: DiscoverState, now: Date): boolean {
  if (timing.startMs === undefined) return true;
  const finish = timing.endMs ?? timing.startMs;
  if (finish < now.getTime()) return false;
  const today = localDateOf(now.getTime(), timing.zone);
  let range: { from: string; to: string } | null;
  if (state.when.kind === "dates") {
    range = { from: state.when.from, to: state.when.to };
  } else {
    range = presetDates(
      state.when.preset,
      today,
      weekdayOf(parseIsoDate(today)!),
    );
  }
  if (range) {
    if (timing.endDate! < range.from || timing.startDate! > range.to) {
      return false;
    }
  }
  const multiDay = timing.startDate !== timing.endDate;
  if (
    state.when.kind === "preset" &&
    state.when.preset === "tonight" &&
    !multiDay &&
    timing.startMinute! < TONIGHT_FROM_MINUTE
  ) {
    return false;
  }
  if (state.time && !multiDay) {
    const minute = timing.startMinute!;
    if (state.time === "morning" && minute >= AFTERNOON_FROM_MINUTE) {
      return false;
    }
    if (
      state.time === "afternoon" &&
      (minute < AFTERNOON_FROM_MINUTE || minute >= EVENING_FROM_MINUTE)
    ) {
      return false;
    }
    if (state.time === "evening" && minute < EVENING_FROM_MINUTE) return false;
  }
  return true;
}

function priceWords(
  item: DiscoveryMapItem,
  kind: ResultKind,
): ResultRow["price"] {
  if (!item.price) return undefined;
  const { amountMinor, currency } = item.price;
  if (amountMinor === 0) {
    return { label: "Free", detail: "No charge to join" };
  }
  const orderKind: OrderItemKind =
    kind === "court" ? "booking" : "registration";
  try {
    const order = priceConsumerOrder({
      currency,
      isDunaPlus: false,
      items: [
        {
          id: item.id,
          kind: orderKind,
          description: item.title,
          quantity: 1,
          unitAmountMinor: amountMinor,
        },
      ],
    });
    return {
      label: `${formatMoney(order.totalMinor, order.currency)} all-in`,
      detail:
        order.totalMinor > amountMinor
          ? `${formatMoney(amountMinor, currency)} plus the service fee, per player. Premium members pay no service fee.`
          : "Per player, nothing added at checkout.",
    };
  } catch {
    return {
      label: formatMoney(amountMinor, currency),
      detail: "Per player, before fees.",
    };
  }
}

/**
 * The group state in the shared words. The feed carries only the places
 * left (no minimum, no lock: Needs API), so it is the capacity-only state:
 * "3 spots left" or "Full".
 */
export function groupWords(
  spotsRemaining: number | undefined,
  startsAt: number | undefined,
  now: Date,
): ResultRow["group"] {
  if (spotsRemaining === undefined || startsAt === undefined) return undefined;
  const full = spotsRemaining === 0;
  const display = participationDisplay({
    capacity: Math.max(1, spotsRemaining),
    booked: full ? 1 : 0,
    startsAt: new Date(startsAt),
    endsAt: new Date(startsAt + 60 * 60_000),
    now,
  });
  return {
    words: renderParticipationCopy(display.status),
    tone: full ? "caution" : display.tone,
  };
}

const LIGHT_WORDS = {
  daylight: "Daylight",
  "golden-hour": "Golden hour",
  "first-light": "First light",
  dark: "After dark",
  "under-lights": "Under lights",
} as const;

/** "Golden hour · sunset 4:47 PM", from the sun at the place and hour. */
export function lightLine(
  latitude: number | undefined,
  longitude: number | undefined,
  startMs: number | undefined,
  zone: string,
): string | undefined {
  if (latitude === undefined || longitude === undefined || !startMs) {
    return undefined;
  }
  if (zone === DEFAULT_ZONE) return undefined;
  const date = parseIsoDate(localDateOf(startMs, zone));
  if (!date) return undefined;
  const sun = sunTimes(latitude, longitude, date);
  const mark = lightMarkFor(startMs, { sun, courtIsLit: false });
  const sunset =
    sun.sunset !== null ? ` · sunset ${formatClock(sun.sunset, zone)}` : "";
  return `${LIGHT_WORDS[mark]}${sunset}`;
}

function realImage(url: string | undefined) {
  if (!url || url.startsWith(LIBRARY_ART)) return undefined;
  return url;
}

function rowFor(
  item: DiscoveryMapItem,
  kind: ResultKind,
  timing: Timing,
  origin: DiscoverResults["origin"],
  options: DiscoverOptions,
  venue?: VenueSummary,
): ResultRow {
  const miles = origin ? distanceMiles(origin, item) : undefined;
  const venueId = item.entityType === "venue" ? item.id.slice(6) : undefined;
  const href =
    venueId && options.venueHref ? options.venueHref(venueId) : item.href;
  let time: string | undefined;
  let multiDay: string | undefined;
  if (timing.startMs !== undefined) {
    const start = formatClock(timing.startMs, timing.zone);
    if (timing.startDate !== timing.endDate) {
      multiDay = `${isoDayWords(timing.startDate!)} to ${isoDayWords(timing.endDate!)}`;
      time = start;
    } else if (timing.endMs !== undefined && timing.endMs > timing.startMs) {
      time = `${start} to ${formatClock(timing.endMs, timing.zone)}`;
    } else {
      time = start;
    }
  }
  const facts =
    kind === "court"
      ? [
          item.courtCount
            ? `${item.courtCount} ${item.courtCount === 1 ? "court" : "courts"}`
            : null,
          isIndoor(item) ? "Indoor" : null,
          item.openNow === true ? "Open now" : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      : undefined;
  return {
    id: item.id,
    kind,
    kindLabel: kindLabel(item, kind),
    title: item.title,
    href,
    place: item.subtitle || venue?.name || "",
    ...(item.latitude !== undefined && item.longitude !== undefined
      ? { latitude: item.latitude, longitude: item.longitude }
      : {}),
    ...(miles !== undefined && Number.isFinite(miles)
      ? { distance: formatDistance(miles), distanceMiles: miles }
      : {}),
    ...(timing.startDate ? { localDate: timing.startDate } : {}),
    ...(time ? { time } : {}),
    ...(item.startsAt ? { startsAt: item.startsAt } : {}),
    ...(multiDay ? { multiDay } : {}),
    ...(timing.startMs !== undefined ? { timeZone: timing.zone } : {}),
    ...(item.level ? { level: `Sand Rating ${item.level}` } : {}),
    ...(priceWords(item, kind) ? { price: priceWords(item, kind) } : {}),
    ...(groupWords(item.spotsRemaining, timing.startMs, options.now)
      ? { group: groupWords(item.spotsRemaining, timing.startMs, options.now) }
      : {}),
    ...(lightLine(item.latitude, item.longitude, timing.startMs, timing.zone)
      ? {
          conditions: lightLine(
            item.latitude,
            item.longitude,
            timing.startMs,
            timing.zone,
          ),
        }
      : {}),
    live: item.live === true,
    ...(realImage(item.imageUrl) ? { imageUrl: realImage(item.imageUrl) } : {}),
    ...(facts ? { facts } : {}),
  };
}

/** Free text to a Duna venue or town, when one matches well. */
export function resolveText(
  text: string,
  venues: readonly VenueSummary[],
): Extract<DiscoverWhere, { kind: "place" }> | undefined {
  let best: { venue: VenueSummary; score: number; town: boolean } | undefined;
  for (const venue of venues) {
    const byName = fuzzyScore(text, venue.name);
    const byTown = fuzzyScore(text, `${venue.city} ${venue.region}`);
    const score = Math.max(byName, byTown);
    if (score >= 0 && (!best || score > best.score)) {
      best = { venue, score, town: byTown > byName };
    }
  }
  if (!best) return undefined;
  const { venue, town } = best;
  return town
    ? {
        kind: "place",
        label: `${venue.city}, ${venue.region}`,
        latitude: venue.latitude,
        longitude: venue.longitude,
      }
    : {
        kind: "place",
        label: venue.name,
        address: `${venue.city}, ${venue.region}`,
        latitude: venue.latitude,
        longitude: venue.longitude,
        venueId: venue.id,
      };
}

function textMatches(item: DiscoveryMapItem, text: string) {
  const needle = normalizeText(text);
  if (!needle) return true;
  return [item.title, item.subtitle, ...item.tags].some((value) =>
    normalizeText(value).includes(needle),
  );
}

/** Run a search over the feed. */
export function searchDiscover(
  items: readonly DiscoveryMapItem[],
  venues: readonly VenueSummary[],
  state: DiscoverState,
  options: DiscoverOptions,
): DiscoverResults {
  const { now } = options;
  const enough = options.enough ?? 5;
  let where = state.where;
  let resolvedFrom: string | undefined;
  let textFilter: string | undefined;
  if (where.kind === "text") {
    const resolved = resolveText(where.text, venues);
    if (resolved) {
      resolvedFrom = where.text;
      where = resolved;
    } else {
      textFilter = where.text;
    }
  }
  const origin =
    where.kind === "place" || where.kind === "near-me"
      ? { latitude: where.latitude, longitude: where.longitude }
      : undefined;

  type Candidate = {
    readonly item: DiscoveryMapItem;
    readonly kind: ResultKind;
    readonly timing: Timing;
    readonly miles: number;
  };
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const kind = resultKind(item);
    if (kind === "club" && state.what.length > 0) continue;
    if (!whatMatches(kind, state.what)) continue;
    if (!surfaceMatches(item, state)) continue;
    if (textFilter && !textMatches(item, textFilter)) continue;
    const timing = timingOf(item, zoneFor(item, venues));
    if (!whenMatches(timing, state, now)) continue;
    candidates.push({
      item,
      kind,
      timing,
      miles: origin ? distanceMiles(origin, item) : 0,
    });
  }

  let radiusMiles: number | undefined;
  let radiusAutomatic = false;
  let chosen = candidates;
  if (origin) {
    const steps =
      where.kind === "place" && where.venueId
        ? RADIUS_STEPS_MILES
        : RADIUS_STEPS_MILES.filter((step) => step >= 5);
    if (state.radius !== null) {
      radiusMiles = state.radius;
    } else {
      radiusAutomatic = true;
      radiusMiles =
        steps.find(
          (step) =>
            candidates.filter((candidate) => candidate.miles <= step).length >=
            enough,
        ) ?? steps[steps.length - 1];
    }
    chosen = candidates.filter((candidate) => candidate.miles <= radiusMiles!);
  }

  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const toRow = (candidate: Candidate) =>
    rowFor(
      candidate.item,
      candidate.kind,
      candidate.timing,
      origin,
      options,
      candidate.item.entityType === "venue"
        ? venueById.get(candidate.item.id.slice(6))
        : undefined,
    );

  const sessions = chosen
    .filter((candidate) => candidate.timing.startMs !== undefined)
    .sort(
      (left, right) =>
        Number(right.item.live === true) - Number(left.item.live === true) ||
        left.timing.startDate!.localeCompare(right.timing.startDate!) ||
        left.timing.startMs! - right.timing.startMs! ||
        left.miles - right.miles ||
        left.item.title.localeCompare(right.item.title),
    );
  const placeOrder: Record<string, number> = {
    court: 0,
    club: 1,
    coach: 2,
  };
  const places = chosen
    .filter((candidate) => candidate.timing.startMs === undefined)
    .sort(
      (left, right) =>
        (origin ? left.miles - right.miles : 0) ||
        (placeOrder[left.kind] ?? 3) - (placeOrder[right.kind] ?? 3) ||
        left.item.title.localeCompare(right.item.title),
    );

  const days: { date: string; label: string; rows: ResultRow[] }[] = [];
  for (const candidate of sessions) {
    const live = candidate.item.live === true;
    const today = localDateOf(now.getTime(), candidate.timing.zone);
    // A multi-day event already under way sits under today.
    const date = live
      ? today
      : candidate.timing.startDate! < today
        ? today
        : candidate.timing.startDate!;
    let group = days.find((day) => day.date === date);
    if (!group) {
      group = {
        date,
        label: dayLabel(date, today, addDays(today, 1)),
        rows: [],
      };
      days.push(group);
    }
    group.rows.push(toRow(candidate));
  }
  days.sort((left, right) => left.date.localeCompare(right.date));

  const count =
    days.reduce((total, day) => total + day.rows.length, 0) + places.length;

  // Nothing here: the closest things anywhere (any time, anything), so the
  // visitor always has somewhere to go next.
  let nearby: ResultRow[] = [];
  if (count === 0 && origin) {
    nearby = items
      .filter(
        (item) =>
          item.latitude !== undefined &&
          (item.startsAt === undefined ||
            Date.parse(item.endsAt ?? item.startsAt) >= now.getTime()),
      )
      .map((item) => ({ item, miles: distanceMiles(origin, item) }))
      .sort((left, right) => left.miles - right.miles)
      .slice(0, 3)
      .map(({ item }) => {
        const kind = resultKind(item);
        return rowFor(
          item,
          kind,
          timingOf(item, zoneFor(item, venues)),
          origin,
          options,
        );
      });
  }

  return {
    days,
    places: places.map(toRow),
    count,
    ...(origin ? { origin } : {}),
    ...(radiusMiles !== undefined ? { radiusMiles } : {}),
    radiusAutomatic,
    whereText: whereLabel(where),
    ...(resolvedFrom ? { resolvedFrom } : {}),
    nearby,
  };
}

/** Kilometres for the map's "search this area" radius. */
export function milesToKm(miles: number) {
  return miles * MILE_KM;
}
