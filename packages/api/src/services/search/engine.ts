/**
 * The search engine (B10): pure filtering, ordering, facets and paging over
 * search candidates. Candidates are discovery-map items (the same objects
 * `runDiscoverySearch` takes) with search facts attached, so the order comes
 * from ../../discovery-ranking.ts, shared with the device search.
 *
 * Nothing here touches the database, the network or the clock: the service
 * (./service.ts) loads candidates, passes `now`, and adds live availability
 * for the visible page only.
 */
import type { DiscoveryMapItem } from "../../contracts";
import type {
  SearchQueryInput,
  SearchResult,
  searchKindSchema,
} from "../../contracts/search";
import {
  DAYPARTS,
  KILOMETRES_PER_MILE,
  compareDiscoverySortKeys,
  discoveryDistanceMiles,
  discoveryMatchesDayparts,
  discoveryMatchesLocalDates,
  discoveryMatchesWhat,
  discoverySortKey,
  discoveryTextScore,
  isValidTimeZone,
  normalizeSearchText,
  rankNearby,
  sortDiscoveryItems,
  type Daypart,
  type DiscoveryCoordinates,
  type DiscoveryWhat,
} from "../../discovery-ranking";
import type { z } from "zod";
import {
  decodeCursor,
  encodeCursor,
  fingerprint,
  truncateKeyTitle,
} from "./cursor";

export type SearchKind = z.infer<typeof searchKindSchema>;
export type SearchAvailability = SearchResult["availability"];

/** Search facts attached to a discovery item. */
export interface SearchCandidateFacts {
  readonly kind: SearchKind;
  /** A stable UUID for the result (the same thing always has the same id). */
  readonly resultId: string;
  /** The searchable thing's own id (event, venue, club, coach, session). */
  readonly entityId: string;
  readonly visibility: "public" | "members";
  readonly venueId?: string;
  /** Where the dates are read when the searcher gives no zone. */
  readonly timeZone: string;
  readonly locality?: string;
  /** Known without a database read (events, venues, the Pro Tour). */
  readonly availability?: SearchAvailability;
  /** A catalog session occurrence: availability is computed per page. */
  readonly sessionOccurrenceId?: string;
}

export type SearchCandidate = DiscoveryMapItem & {
  readonly search: SearchCandidateFacts;
};

export interface SearchBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface SearchCriteria {
  readonly near?: DiscoveryCoordinates & { readonly radiusKm: number };
  readonly bounds?: SearchBounds;
  readonly place?: {
    readonly organizationId?: string;
    readonly venueId?: string;
    readonly text?: string;
  };
  readonly when?: {
    readonly from: string;
    readonly to: string;
    readonly timeZone?: string;
  };
  readonly dayparts: readonly Daypart[];
  readonly kinds: readonly SearchKind[];
  /** The device search's What groups (parity; a proposed contract field). */
  readonly groups: readonly DiscoveryWhat[];
  readonly tags: readonly string[];
  readonly text?: string;
}

export class SearchInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchInputError";
  }
}

export const SEARCH_LIMITS = {
  /** Longest When range, in days. */
  maxRangeDays: 366,
  /** Results a page may hold (the contract caps `limit` at 100). */
  maxPageSize: 100,
  /** Results a near search needs before it stops widening. */
  minimumNearbyResults: 5,
  /** Tag facets returned. */
  tagFacets: 12,
} as const;

export const SEARCH_KIND_LABELS: Readonly<Record<SearchKind, string>> = {
  club: "Clubs",
  venue: "Venues",
  "public-court": "Public courts",
  event: "Events",
  league: "Leagues",
  lesson: "Lessons",
  program: "Programs",
  coach: "Coaches",
  "open-play": "Open play",
};

const LESSON_KINDS = new Set([
  "clinic",
  "lesson",
  "private-lesson",
  "training",
  "group",
]);

/** The search kind of a discovery item. */
export function searchKindForItem(
  item: Pick<DiscoveryMapItem, "entityType" | "kind">,
): SearchKind {
  const kind = item.kind.toLowerCase();
  if (item.entityType === "organization") return "club";
  if (item.entityType === "venue") return "venue";
  if (item.entityType === "coach") return "coach";
  if (kind === "league") return "league";
  if (kind === "pickup" || kind === "open-play") return "open-play";
  if (LESSON_KINDS.has(kind)) return "lesson";
  return "event";
}

/** Search kinds that cover a device What group (an approximation; see docs). */
export function searchKindsForDiscoveryWhat(
  what: DiscoveryWhat,
): readonly SearchKind[] {
  switch (what) {
    case "for-you":
      return [];
    case "events":
      return ["event", "league", "open-play"];
    case "tournaments":
      return ["event"];
    case "leagues":
      return ["league"];
    case "training":
      return ["lesson", "coach"];
    case "matches":
      return ["open-play", "event"];
    case "court-rentals":
      return ["venue", "club"];
  }
}

const RESERVED_TAG = /^daypart:(.+)$/;
const PLACE_ID = /^(venue|club):([0-9a-f-]{36})$/i;
const DATE_MS = 86_400_000;

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * The contract input as criteria, validated. Two contract-compatible
 * encodings: `what.tags` entries `daypart:morning|afternoon|evening` filter
 * by venue-local start time; `where.place` `venue:<id>` or `club:<id>`
 * narrows to one Duna venue or club (any other text matches the place
 * name, the locality and the result title).
 */
export function criteriaFromInput(input: SearchQueryInput): SearchCriteria {
  const bounds = input.where?.bounds;
  if (bounds && bounds.west > bounds.east) {
    throw new SearchInputError(
      "Move the map so the area does not cross the date line.",
    );
  }
  let when: SearchCriteria["when"];
  if (input.when) {
    const from = Date.parse(`${input.when.from}T00:00:00Z`);
    const to = Date.parse(`${input.when.to}T00:00:00Z`);
    if (to < from) {
      throw new SearchInputError("The end date is before the start date.");
    }
    if ((to - from) / DATE_MS + 1 > SEARCH_LIMITS.maxRangeDays) {
      throw new SearchInputError("Choose dates within one year.");
    }
    if (input.when.timezone && !isValidTimeZone(input.when.timezone)) {
      throw new SearchInputError("That time zone is not recognised.");
    }
    when = {
      from: input.when.from,
      to: input.when.to,
      ...(input.when.timezone ? { timeZone: input.when.timezone } : {}),
    };
  }
  const dayparts = new Set<Daypart>();
  const tags = new Set<string>();
  for (const raw of input.what?.tags ?? []) {
    const tag = normalizeTag(raw);
    const reserved = RESERVED_TAG.exec(tag);
    if (reserved) {
      const part = reserved[1] as Daypart;
      if (!DAYPARTS.includes(part)) {
        throw new SearchInputError("Choose morning, afternoon or evening.");
      }
      dayparts.add(part);
    } else if (tag) {
      tags.add(tag);
    }
  }
  let place: SearchCriteria["place"];
  const placeText = input.where?.place?.trim();
  if (placeText) {
    const id = PLACE_ID.exec(placeText);
    if (id) {
      const value = id[2]!.toLowerCase();
      place =
        id[1]!.toLowerCase() === "venue"
          ? { venueId: value }
          : { organizationId: value };
    } else {
      const text = normalizeSearchText(placeText);
      if (text) place = { text };
    }
  }
  const text = input.text ? normalizeSearchText(input.text) : "";
  return {
    ...(input.where?.near ? { near: { ...input.where.near } } : {}),
    ...(bounds ? { bounds: { ...bounds } } : {}),
    ...(place ? { place } : {}),
    ...(when ? { when } : {}),
    dayparts: DAYPARTS.filter((part) => dayparts.has(part)),
    kinds: [...new Set(input.what?.kinds ?? [])].sort(),
    groups: [],
    tags: [...tags].sort(),
    ...(text ? { text } : {}),
  };
}

function ended(item: DiscoveryMapItem, nowMs: number): boolean {
  const end = Date.parse(item.endsAt ?? item.startsAt ?? "");
  return !item.live && Number.isFinite(end) && end < nowMs;
}

function inBounds(item: DiscoveryMapItem, bounds: SearchBounds): boolean {
  return (
    item.latitude !== undefined &&
    item.longitude !== undefined &&
    item.latitude <= bounds.north &&
    item.latitude >= bounds.south &&
    item.longitude <= bounds.east &&
    item.longitude >= bounds.west
  );
}

function matchesPlace(
  candidate: SearchCandidate,
  place: NonNullable<SearchCriteria["place"]>,
): boolean {
  if (place.organizationId) {
    return candidate.organizationId === place.organizationId;
  }
  if (place.venueId) return candidate.search.venueId === place.venueId;
  const text = place.text ?? "";
  const haystack = ` ${normalizeSearchText(
    [candidate.search.locality, candidate.subtitle, candidate.title].join(" "),
  )} `;
  return haystack.includes(` ${text}`);
}

function hasTags(candidate: SearchCandidate, tags: readonly string[]) {
  if (tags.length === 0) return true;
  const own = new Set(candidate.tags.map(normalizeTag));
  return tags.every((tag) => own.has(tag));
}

function boundsCenter(bounds: SearchBounds): DiscoveryCoordinates {
  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.east + bounds.west) / 2,
  };
}

/** A stable text form of the criteria: the cursor fingerprint. */
export function criteriaFingerprint(criteria: SearchCriteria): string {
  return fingerprint(JSON.stringify(criteria));
}

export interface SearchFacet {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface SearchRun {
  readonly page: readonly SearchCandidate[];
  readonly nextCursor?: string;
  readonly totalEstimate: number;
  readonly facets: {
    readonly kinds: readonly (SearchFacet & { readonly value: SearchKind })[];
    readonly tags: readonly SearchFacet[];
  };
  readonly resultBounds?: SearchBounds;
  readonly origin?: DiscoveryCoordinates;
  readonly radiusMiles?: number;
  readonly expandedWorldwide: boolean;
  /** Miles from the searched point, for `distanceKm`. */
  readonly distanceMiles: (candidate: SearchCandidate) => number | undefined;
}

function facetCounts(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/**
 * Filters, orders and pages candidates. The order is the device search's
 * (live, nearest, soonest, title), preceded by text relevance when text was
 * typed. Results that already ended are left out unless they are live.
 */
export function runSearch(
  candidates: readonly SearchCandidate[],
  criteria: SearchCriteria,
  options: {
    readonly now: Date;
    readonly limit: number;
    readonly cursor?: string;
    readonly minimumNearbyResults?: number;
  },
): SearchRun {
  const nowMs = options.now.getTime();
  const limit = Math.max(1, Math.min(SEARCH_LIMITS.maxPageSize, options.limit));
  const print = criteriaFingerprint(criteria);
  const decoded = options.cursor
    ? decodeCursor(options.cursor, print)
    : undefined;
  const radiusMiles = criteria.near
    ? criteria.near.radiusKm / KILOMETRES_PER_MILE
    : undefined;
  const relevance = new Map<SearchCandidate, number>();

  const base = candidates.filter((candidate) => {
    if (ended(candidate, nowMs)) return false;
    if (criteria.place && !matchesPlace(candidate, criteria.place)) {
      return false;
    }
    if (criteria.bounds && !inBounds(candidate, criteria.bounds)) return false;
    // Near a point: a mapped result farther than the radius is out. One
    // without a map point stays, as on the device: it is never inside a
    // radius step, and lists last when the search expands worldwide.
    if (
      criteria.near &&
      !criteria.bounds &&
      candidate.latitude !== undefined &&
      candidate.longitude !== undefined &&
      discoveryDistanceMiles(criteria.near, candidate) > radiusMiles!
    ) {
      return false;
    }
    const zone = criteria.when?.timeZone ?? candidate.search.timeZone;
    if (
      criteria.when &&
      !discoveryMatchesLocalDates(candidate, criteria.when, zone)
    ) {
      return false;
    }
    if (
      !discoveryMatchesDayparts(
        candidate,
        criteria.dayparts,
        criteria.when?.timeZone ?? candidate.search.timeZone,
      )
    ) {
      return false;
    }
    if (!discoveryMatchesWhat(candidate, criteria.groups)) return false;
    if (!hasTags(candidate, criteria.tags)) return false;
    if (criteria.text) {
      const score = discoveryTextScore(candidate, criteria.text);
      if (score === 0) return false;
      relevance.set(candidate, score);
    }
    return true;
  });
  const kindFilter = new Set(criteria.kinds);
  const matching =
    kindFilter.size === 0
      ? base
      : base.filter((candidate) => kindFilter.has(candidate.search.kind));
  const score = criteria.text
    ? (candidate: SearchCandidate) => relevance.get(candidate) ?? 0
    : undefined;

  let ranked: readonly SearchCandidate[];
  let origin: DiscoveryCoordinates | undefined;
  let chosenRadius: number | undefined;
  let expandedWorldwide = false;
  if (criteria.near && !criteria.bounds) {
    origin = {
      latitude: criteria.near.latitude,
      longitude: criteria.near.longitude,
    };
    const nearby = rankNearby(matching, origin, {
      minimumNearbyResults:
        options.minimumNearbyResults ?? SEARCH_LIMITS.minimumNearbyResults,
      ...(decoded && decoded.radiusMiles !== undefined
        ? { pinnedRadiusMiles: decoded.radiusMiles }
        : {}),
      relevance: score,
    });
    ranked = nearby.items;
    chosenRadius = nearby.radiusMiles;
    expandedWorldwide = nearby.expandedWorldwide;
  } else {
    origin = criteria.near
      ? { latitude: criteria.near.latitude, longitude: criteria.near.longitude }
      : criteria.bounds
        ? boundsCenter(criteria.bounds)
        : undefined;
    ranked = sortDiscoveryItems(matching, { origin, relevance: score });
  }

  const keyOf = (candidate: SearchCandidate) =>
    discoverySortKey(candidate, { origin, relevance: score?.(candidate) });
  let remaining = ranked;
  if (decoded) {
    remaining = ranked.filter(
      (candidate) =>
        compareDiscoverySortKeys(
          truncateKeyTitle(keyOf(candidate), decoded.titleChars),
          decoded.key,
        ) > 0,
    );
  }
  const page = remaining.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    remaining.length > limit && last
      ? encodeCursor({
          fingerprint: print,
          ...(criteria.near && !criteria.bounds
            ? { radiusMiles: chosenRadius ?? null }
            : {}),
          key: keyOf(last),
        }).cursor
      : undefined;

  const kindCounts = facetCounts(
    base.map((candidate) => candidate.search.kind),
  );
  const tagCounts = facetCounts(
    ranked.flatMap((candidate) => [
      ...new Set(
        candidate.tags
          .map(normalizeTag)
          .filter((tag) => tag.length > 0 && tag.length <= 48),
      ),
    ]),
  );
  const geocoded = ranked.filter(
    (candidate) =>
      candidate.latitude !== undefined && candidate.longitude !== undefined,
  );
  const resultBounds =
    geocoded.length > 0
      ? {
          north: Math.max(...geocoded.map((c) => c.latitude!)),
          south: Math.min(...geocoded.map((c) => c.latitude!)),
          east: Math.max(...geocoded.map((c) => c.longitude!)),
          west: Math.min(...geocoded.map((c) => c.longitude!)),
        }
      : undefined;
  const searchedPoint = criteria.near;
  return {
    page,
    ...(nextCursor ? { nextCursor } : {}),
    totalEstimate: ranked.length,
    facets: {
      kinds: [...kindCounts.entries()]
        .map(([value, count]) => ({
          value: value as SearchKind,
          label: SEARCH_KIND_LABELS[value as SearchKind],
          count,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      tags: [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, SEARCH_LIMITS.tagFacets)
        .map(([value, count]) => ({ value, label: value, count })),
    },
    ...(resultBounds ? { resultBounds } : {}),
    ...(origin ? { origin } : {}),
    ...(chosenRadius !== undefined ? { radiusMiles: chosenRadius } : {}),
    expandedWorldwide,
    distanceMiles: (candidate) => {
      if (!searchedPoint) return undefined;
      const miles = discoveryDistanceMiles(searchedPoint, candidate);
      return Number.isFinite(miles) ? miles : undefined;
    },
  };
}

/** Kilometres, one decimal, for `distanceKm`. */
export function milesToKm(miles: number): number {
  return Math.round(miles * KILOMETRES_PER_MILE * 10) / 10;
}
