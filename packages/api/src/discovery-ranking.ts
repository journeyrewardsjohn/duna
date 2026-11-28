/**
 * The one place discovery results are filtered and ordered (B10). Pure and
 * React-Native safe: no Node built-ins, no network, no clock except the
 * `now` a caller passes. Two callers share it:
 *
 *   - the device search, `runDiscoverySearch` (./discovery-search.ts), which
 *     the Player Find screen and the site's discover pages run today over
 *     `public.discoveryMap`;
 *   - the server search, `public.search.query` (./services/search), which
 *     runs the same filters and the same order over the same items.
 *
 * Parity between the two is proven in services/search/parity.test.ts.
 */
import type { DiscoveryMapItem } from "./contracts";

export type DiscoveryCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

export type DiscoveryWhat =
  | "for-you"
  | "events"
  | "tournaments"
  | "leagues"
  | "training"
  | "matches"
  | "court-rentals";

/** The Find screen's What groups: the discovery groups plus coaches. */
export type DiscoveryGroup = Exclude<DiscoveryWhat, "for-you"> | "coaches";

export const DISCOVERY_RADIUS_STEPS = [
  10, 30, 60, 120, 240, 480, 960, 1_920, 3_840, 7_680, 12_000,
] as const;

export const KILOMETRES_PER_MILE = 1.609344;

export function discoveryDistanceMiles(
  origin: DiscoveryCoordinates,
  item: Pick<DiscoveryMapItem, "latitude" | "longitude">,
): number {
  if (item.latitude === undefined || item.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(item.latitude - origin.latitude);
  const longitudeDelta = radians(item.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isGeocoded(item: Pick<DiscoveryMapItem, "latitude" | "longitude">) {
  return item.latitude !== undefined && item.longitude !== undefined;
}

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

/** Overlap with an instant range (the device form: ISO boundaries). */
export function discoveryMatchesInstantRange(
  item: Pick<DiscoveryMapItem, "startsAt" | "endsAt">,
  range: { readonly startsAt?: string; readonly endsAt?: string } | undefined,
): boolean {
  if (!range?.startsAt || !range.endsAt) return true;
  if (!item.startsAt && !item.endsAt) return true;
  const rangeStart = Date.parse(range.startsAt);
  const rangeEnd = Date.parse(range.endsAt);
  const itemStart = Date.parse(item.startsAt ?? item.endsAt ?? "");
  const itemEnd = Date.parse(item.endsAt ?? item.startsAt ?? "");
  if ([rangeStart, rangeEnd, itemStart, itemEnd].some(Number.isNaN)) {
    return true;
  }
  return itemStart <= rangeEnd && itemEnd >= rangeStart;
}

const localPartsCache = new Map<string, Intl.DateTimeFormat>();

function localFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = localPartsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    localPartsCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock date and time of an instant in a zone ("2026-03-08", 1, 30). */
export function discoveryLocalParts(
  instant: number,
  timeZone: string,
): { readonly date: string; readonly hour: number; readonly minute: number } {
  const parts: Record<string, string> = {};
  for (const part of localFormatter(timeZone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    localFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Overlap with calendar dates (inclusive) read in one zone: the venue's own
 * zone when the searcher did not give one. Comparing local dates is exact
 * across daylight-saving changes (a 23- or 25-hour day is still one date)
 * and equals `discoveryMatchesInstantRange` with midnight-to-midnight
 * boundaries in the same zone.
 */
export function discoveryMatchesLocalDates(
  item: Pick<DiscoveryMapItem, "startsAt" | "endsAt">,
  range: { readonly from: string; readonly to: string },
  timeZone: string,
): boolean {
  if (!item.startsAt && !item.endsAt) return true;
  const itemStart = Date.parse(item.startsAt ?? item.endsAt ?? "");
  const itemEnd = Date.parse(item.endsAt ?? item.startsAt ?? "");
  if (Number.isNaN(itemStart) || Number.isNaN(itemEnd)) return true;
  return (
    discoveryLocalParts(itemStart, timeZone).date <= range.to &&
    discoveryLocalParts(itemEnd, timeZone).date >= range.from
  );
}

export type Daypart = "morning" | "afternoon" | "evening";
export const DAYPARTS: readonly Daypart[] = ["morning", "afternoon", "evening"];

/** Morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–04:59, venue time. */
export function daypartOfHour(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/** Undated things (clubs, venues, coaches) pass: they are there all day. */
export function discoveryMatchesDayparts(
  item: Pick<DiscoveryMapItem, "startsAt">,
  dayparts: readonly Daypart[],
  timeZone: string,
): boolean {
  if (dayparts.length === 0 || !item.startsAt) return true;
  const start = Date.parse(item.startsAt);
  if (Number.isNaN(start)) return true;
  return dayparts.includes(
    daypartOfHour(discoveryLocalParts(start, timeZone).hour),
  );
}

// ---------------------------------------------------------------------------
// What
// ---------------------------------------------------------------------------

const TRAINING_KINDS = ["clinic", "private-lesson", "lesson", "training"];
const MATCH_KINDS = ["match", "open-play", "pickup", "hosted-match"];

export function discoveryMatchesWhat(
  item: Pick<DiscoveryMapItem, "entityType" | "kind">,
  what: readonly DiscoveryWhat[],
): boolean {
  if (what.length === 0 || what.includes("for-you")) return true;
  const kind = item.kind.toLowerCase();
  return what.some((selection) => {
    if (selection === "events") {
      return item.entityType === "event" && kind !== "tournament";
    }
    if (selection === "tournaments") {
      return item.entityType === "pro-tour" || kind === "tournament";
    }
    if (selection === "leagues") return kind === "league";
    if (selection === "training") {
      return item.entityType === "coach" || TRAINING_KINDS.includes(kind);
    }
    if (selection === "matches") {
      return item.entityType === "match" || MATCH_KINDS.includes(kind);
    }
    return item.entityType === "venue" || kind === "court-booking";
  });
}

/** Which What group a result is listed under (first match wins). */
export function discoveryGroupForItem(
  item: Pick<DiscoveryMapItem, "entityType" | "kind">,
): DiscoveryGroup {
  const kind = item.kind.toLowerCase();
  if (item.entityType === "coach") return "coaches";
  if (item.entityType === "pro-tour" || kind === "tournament") {
    return "tournaments";
  }
  if (kind === "league") return "leagues";
  if (TRAINING_KINDS.includes(kind)) return "training";
  if (item.entityType === "match" || MATCH_KINDS.includes(kind)) {
    return "matches";
  }
  if (
    item.entityType === "venue" ||
    item.entityType === "organization" ||
    kind === "court-booking"
  ) {
    return "court-rentals";
  }
  return "events";
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const SEARCH_TEXT_MAX_LENGTH = 120;

/** Lower case, accents off, punctuation to spaces, one space between words. */
export function normalizeSearchText(value: string): string {
  return value
    .slice(0, SEARCH_TEXT_MAX_LENGTH)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * How well an item matches typed text: 4 the whole title, 3 the title
 * starts with it, 2 a title word starts with it, 1 every word appears
 * somewhere (title, subtitle, tags), 0 no match.
 */
export function discoveryTextScore(
  item: Pick<DiscoveryMapItem, "title" | "subtitle" | "tags">,
  text: string,
): number {
  const query = normalizeSearchText(text);
  if (!query) return 1;
  const title = normalizeSearchText(item.title);
  if (title === query) return 4;
  if (title.startsWith(query)) return 3;
  if (` ${title}`.includes(` ${query}`)) return 2;
  const haystack = ` ${[title, item.subtitle, ...item.tags]
    .map((value) => normalizeSearchText(value ?? ""))
    .join(" ")} `;
  return query.split(" ").every((word) => haystack.includes(` ${word}`))
    ? 1
    : 0;
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

/**
 * A result's place in the order, as plain data (a cursor carries one):
 * relevance (high first), live first, nearest first, soonest first, title,
 * then id so the order is total. `null` distance or start sorts last.
 */
export type DiscoverySortKey = readonly [
  relevance: number,
  live: 0 | 1,
  distance: number | null,
  start: number | null,
  title: string,
  id: string,
];

export function discoverySortKey(
  item: Pick<
    DiscoveryMapItem,
    "id" | "live" | "startsAt" | "title" | "latitude" | "longitude"
  >,
  options: {
    readonly origin?: DiscoveryCoordinates;
    readonly relevance?: number;
  } = {},
): DiscoverySortKey {
  const distance = options.origin
    ? discoveryDistanceMiles(options.origin, item)
    : null;
  const start = item.startsAt ? Date.parse(item.startsAt) : Number.NaN;
  return [
    options.relevance ?? 0,
    item.live ? 1 : 0,
    distance === null || !Number.isFinite(distance) ? null : distance,
    Number.isNaN(start) ? null : start,
    item.title,
    item.id,
  ];
}

function compareNullableNumbers(left: number | null, right: number | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

export function compareDiscoverySortKeys(
  left: DiscoverySortKey,
  right: DiscoverySortKey,
): number {
  return (
    right[0] - left[0] ||
    right[1] - left[1] ||
    compareNullableNumbers(left[2], right[2]) ||
    compareNullableNumbers(left[3], right[3]) ||
    left[4].localeCompare(right[4]) ||
    (left[5] < right[5] ? -1 : left[5] > right[5] ? 1 : 0)
  );
}

/** Live first, then nearest (when there is an origin), soonest, title. */
export function sortDiscoveryItems<T extends DiscoveryMapItem>(
  items: readonly T[],
  options: {
    readonly origin?: DiscoveryCoordinates;
    readonly relevance?: (item: T) => number;
  } = {},
): T[] {
  const keyed = items.map((item) => ({
    item,
    key: discoverySortKey(item, {
      origin: options.origin,
      relevance: options.relevance?.(item),
    }),
  }));
  keyed.sort((left, right) => compareDiscoverySortKeys(left.key, right.key));
  return keyed.map((entry) => entry.item);
}

export interface NearbyRanking<T> {
  readonly items: readonly T[];
  readonly radiusMiles?: number;
  readonly expandedWorldwide: boolean;
}

/**
 * Near a point: the smallest radius step that holds at least
 * `minimumNearbyResults` geocoded results, nearest first; when no step
 * does, every result nearest first ("expanded worldwide"). A caller paging
 * through results passes the radius it already chose (`pinnedRadiusMiles`)
 * so a page never changes the circle under the person.
 */
export function rankNearby<T extends DiscoveryMapItem>(
  matching: readonly T[],
  origin: DiscoveryCoordinates,
  options: {
    readonly minimumNearbyResults?: number;
    readonly pinnedRadiusMiles?: number | null;
    readonly relevance?: (item: T) => number;
  } = {},
): NearbyRanking<T> {
  const minimum = options.minimumNearbyResults ?? 5;
  const geocoded = matching.filter(isGeocoded);
  const selectedRadius =
    options.pinnedRadiusMiles !== undefined
      ? (options.pinnedRadiusMiles ?? undefined)
      : DISCOVERY_RADIUS_STEPS.find(
          (radius) =>
            geocoded.filter(
              (item) => discoveryDistanceMiles(origin, item) <= radius,
            ).length >= minimum,
        );
  if (selectedRadius !== undefined) {
    const nearby = geocoded.filter(
      (item) => discoveryDistanceMiles(origin, item) <= selectedRadius,
    );
    return {
      items: sortDiscoveryItems(nearby, {
        origin,
        relevance: options.relevance,
      }),
      radiusMiles: selectedRadius,
      expandedWorldwide: false,
    };
  }
  return {
    items: sortDiscoveryItems(matching, {
      origin,
      relevance: options.relevance,
    }),
    expandedWorldwide: matching.length > 0,
  };
}
