/**
 * What search searches (B10): every public discovery-map item (clubs,
 * venues, events and pickups, coaches, the Pro Tour) plus the bookable
 * catalog sessions of the next 120 days (lessons, clinics, group training,
 * open play). Built from the same loaders as `public.discoveryMap`, so the
 * device search and the server search see the same things.
 *
 * Public candidates are cached for a minute per server instance: nothing
 * signed-in is ever cached (members-only sessions are loaded per request).
 * Availability for the visible page is computed live by ./service.ts.
 */
import { createHash } from "node:crypto";
import {
  catalogItems,
  catalogPrices,
  catalogSessionOccurrences,
  getReadOnlyDatabase,
  organizationMemberships,
  organizationParticipants,
  organizations,
  venues,
} from "@duna/db";
import type { EventSummary, VenueSummary } from "@duna/core";
import { and, asc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import type { DiscoveryMap, DiscoveryMapItem } from "../../contracts";
import type { SearchAvailability, SearchCandidate } from "./engine";
import { searchKindForItem } from "./engine";
import type {
  SearchDatabase,
  SessionParticipationSubject,
} from "./participation";

export const SEARCH_CANDIDATE_LIMITS = {
  /** How far ahead sessions are searched. */
  sessionHorizonDays: 120,
  /** Most sessions one candidate load reads (soonest first). */
  sessions: 5_000,
  /** How long public candidates are reused. */
  cacheMs: 60_000,
} as const;

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A name-based UUID (version 5 layout): the same name, the same id. */
export function stableUuid(name: string): string {
  const bytes = createHash("sha1").update(`duna-search:${name}`).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function entityIdFor(item: DiscoveryMapItem): string {
  const parts = item.id.split(":");
  const candidate =
    item.entityType === "coach"
      ? parts[2]
      : item.entityType === "organization"
        ? parts[1]
        : parts.slice(1).join(":");
  return candidate && UUID.test(candidate)
    ? candidate.toLowerCase()
    : stableUuid(`entity:${item.id}`);
}

export interface CandidateSet {
  readonly candidates: readonly SearchCandidate[];
  /** Facts the per-page group state needs, by occurrence id. */
  readonly sessions: ReadonlyMap<string, SessionParticipationSubject>;
  readonly loadedAt: number;
}

function spotsAvailability(
  spotsRemaining: number | undefined,
  summary?: string,
): SearchAvailability {
  if (spotsRemaining === undefined) {
    return { state: "unknown", ...(summary ? { summary } : {}) };
  }
  const state =
    spotsRemaining <= 0 ? "full" : spotsRemaining <= 2 ? "few-left" : "open";
  return { state, ...(summary ? { summary } : {}) };
}

/** Availability known without reading bookings: events, places, the Pro Tour. */
export function staticAvailability(item: DiscoveryMapItem): SearchAvailability {
  if (item.entityType === "pro-tour" || item.entityType === "match") {
    return { state: "not-bookable" };
  }
  if (item.entityType === "event") {
    const state = item.participation?.displayState;
    if (state === "cancelled-low" || state === "cancelled-club") {
      return {
        state: "not-bookable",
        summary: item.participation!.copy.status,
      };
    }
    return spotsAvailability(
      item.spotsRemaining,
      item.participation?.copy.status,
    );
  }
  return { state: "unknown" };
}

function venueFor(
  venueRows: readonly VenueSummary[],
  organizationId?: string,
  venueName?: string,
): VenueSummary | undefined {
  const name = venueName?.trim().toLowerCase();
  return (
    venueRows.find(
      (venue) =>
        venue.organizationId === organizationId &&
        name &&
        venue.name.trim().toLowerCase() === name,
    ) ?? venueRows.find((venue) => venue.organizationId === organizationId)
  );
}

/** Discovery-map items as candidates (public; hidden and cancelled events left out). */
export function discoveryCandidates(input: {
  readonly map: DiscoveryMap;
  readonly events: readonly EventSummary[];
  readonly venues: readonly VenueSummary[];
}): SearchCandidate[] {
  const events = new Map(input.events.map((event) => [event.id, event]));
  const venuesById = new Map(input.venues.map((venue) => [venue.id, venue]));
  const output: SearchCandidate[] = [];
  for (const item of input.map.items) {
    const entityId = entityIdFor(item);
    const event =
      item.entityType === "event" ? events.get(entityId) : undefined;
    if (
      event &&
      (event.visibility === "unlisted" || event.lifecycleStatus === "cancelled")
    ) {
      continue;
    }
    const venue =
      item.entityType === "venue"
        ? venuesById.get(entityId)
        : venueFor(input.venues, item.organizationId, event?.venueName);
    const placeVenue =
      item.entityType === "venue" || item.entityType === "event"
        ? venue
        : undefined;
    const timeZone =
      event?.timezone ??
      (item.entityType === "pro-tour" || item.entityType === "match"
        ? "UTC"
        : (venue?.timezone ?? "UTC"));
    output.push({
      ...item,
      search: {
        kind: searchKindForItem(item),
        resultId: stableUuid(`result:${item.id}`),
        entityId,
        visibility: "public",
        ...(placeVenue ? { venueId: placeVenue.id } : {}),
        timeZone,
        ...(venue?.city ? { locality: venue.city } : {}),
        availability: staticAvailability(item),
      },
    });
  }
  return output;
}

function stringField(
  configuration: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = configuration[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** The kind the device search uses for a catalog session ("training" = group). */
export function sessionDiscoveryKind(item: {
  readonly subtype: string;
  readonly title: string;
}): "open-play" | "clinic" | "training" | "lesson" {
  const text = `${item.subtype} ${item.title}`.toLowerCase();
  if (text.includes("open")) return "open-play";
  if (text.includes("clinic")) return "clinic";
  if (text.includes("group")) return "training";
  return "lesson";
}

const SESSION_TAG: Record<ReturnType<typeof sessionDiscoveryKind>, string> = {
  "open-play": "open-play",
  clinic: "clinic",
  training: "group",
  lesson: "lesson",
};

/**
 * Bookable catalog sessions as candidates: scheduled, not ended, offering
 * active, the club a real club (never a system workspace). `visibility`
 * picks public or members-only offerings; `organizationIds` narrows to the
 * clubs a signed-in person belongs to. Three queries.
 */
export async function loadSessionCandidates(input: {
  readonly database: SearchDatabase;
  readonly now: Date;
  readonly visibility: "public" | "members";
  readonly organizationIds?: readonly string[];
}): Promise<{
  readonly candidates: SearchCandidate[];
  readonly sessions: Map<string, SessionParticipationSubject>;
}> {
  const sessions = new Map<string, SessionParticipationSubject>();
  if (input.organizationIds && input.organizationIds.length === 0) {
    return { candidates: [], sessions };
  }
  const database = input.database;
  const rows = await database
    .select({
      occurrence: {
        id: catalogSessionOccurrences.id,
        startsAt: catalogSessionOccurrences.startsAt,
        endsAt: catalogSessionOccurrences.endsAt,
        timezone: catalogSessionOccurrences.timezone,
        capacity: catalogSessionOccurrences.capacity,
        status: catalogSessionOccurrences.status,
        createdAt: catalogSessionOccurrences.createdAt,
      },
      item: {
        id: catalogItems.id,
        slug: catalogItems.slug,
        title: catalogItems.title,
        subtype: catalogItems.subtype,
        type: catalogItems.type,
        configuration: catalogItems.configuration,
        organizationId: catalogItems.organizationId,
        publishedAt: catalogItems.publishedAt,
      },
      organization: {
        slug: organizations.slug,
        name: organizations.name,
        latitude: organizations.latitude,
        longitude: organizations.longitude,
        locality: organizations.locality,
      },
    })
    .from(catalogSessionOccurrences)
    .innerJoin(
      catalogItems,
      eq(catalogSessionOccurrences.catalogItemId, catalogItems.id),
    )
    .innerJoin(organizations, eq(catalogItems.organizationId, organizations.id))
    .where(
      and(
        eq(catalogSessionOccurrences.status, "scheduled"),
        gte(
          catalogSessionOccurrences.startsAt,
          new Date(input.now.getTime() - DAY_MS),
        ),
        lt(
          catalogSessionOccurrences.startsAt,
          new Date(
            input.now.getTime() +
              SEARCH_CANDIDATE_LIMITS.sessionHorizonDays * DAY_MS,
          ),
        ),
        gt(catalogSessionOccurrences.endsAt, input.now),
        eq(catalogItems.status, "active"),
        eq(catalogItems.type, "service"),
        eq(catalogItems.visibility, input.visibility),
        isNull(organizations.systemKey),
        input.organizationIds
          ? inArray(catalogItems.organizationId, [...input.organizationIds])
          : undefined,
      ),
    )
    .orderBy(
      asc(catalogSessionOccurrences.startsAt),
      asc(catalogSessionOccurrences.id),
    )
    .limit(SEARCH_CANDIDATE_LIMITS.sessions);
  if (rows.length === 0) return { candidates: [], sessions };
  const organizationIds = [
    ...new Set(rows.map((row) => row.item.organizationId)),
  ];
  const itemIds = [...new Set(rows.map((row) => row.item.id))];
  const [venueRows, priceRows] = await Promise.all([
    database
      .select({
        id: venues.id,
        organizationId: venues.organizationId,
        name: venues.name,
        locality: venues.locality,
        latitude: venues.latitude,
        longitude: venues.longitude,
      })
      .from(venues)
      .where(
        and(
          inArray(venues.organizationId, organizationIds),
          eq(venues.status, "active"),
        ),
      )
      .orderBy(asc(venues.name)),
    database
      .select({
        catalogItemId: catalogPrices.catalogItemId,
        amountMinor: catalogPrices.amountMinor,
        currency: catalogPrices.currency,
      })
      .from(catalogPrices)
      .where(
        and(
          inArray(catalogPrices.catalogItemId, itemIds),
          eq(catalogPrices.active, true),
          eq(catalogPrices.paymentKind, "card"),
        ),
      ),
  ]);
  const firstVenue = new Map<string, (typeof venueRows)[number]>();
  for (const venue of venueRows) {
    if (!firstVenue.has(venue.organizationId)) {
      firstVenue.set(venue.organizationId, venue);
    }
  }
  const lowestPrice = new Map<
    string,
    { amountMinor: number; currency: string }
  >();
  for (const price of priceRows) {
    if (
      !price.catalogItemId ||
      price.amountMinor === null ||
      price.currency === null
    ) {
      continue;
    }
    const current = lowestPrice.get(price.catalogItemId);
    if (!current || price.amountMinor < current.amountMinor) {
      lowestPrice.set(price.catalogItemId, {
        amountMinor: price.amountMinor,
        currency: price.currency,
      });
    }
  }
  const candidates: SearchCandidate[] = [];
  for (const { occurrence, item, organization } of rows) {
    const venue = firstVenue.get(item.organizationId);
    const latitude = venue?.latitude ?? organization.latitude ?? undefined;
    const longitude = venue?.longitude ?? organization.longitude ?? undefined;
    const coordinates =
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude }
        : {};
    const kind = sessionDiscoveryKind(item);
    const level =
      stringField(item.configuration, "skillLevel") ??
      stringField(item.configuration, "level");
    const price = lowestPrice.get(item.id);
    const locality = venue?.locality ?? organization.locality ?? undefined;
    candidates.push({
      id: `session:${occurrence.id}`,
      entityType: "event",
      kind,
      title: item.title,
      subtitle: venue?.name ?? organization.name,
      href: `/clubs/${organization.slug}/products/${item.slug}?session=${occurrence.id}`,
      ...coordinates,
      organizationId: item.organizationId,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      ...(level ? { level } : {}),
      ...(price
        ? {
            price: {
              amountMinor: price.amountMinor,
              currency: price.currency as NonNullable<
                DiscoveryMapItem["price"]
              >["currency"],
            },
          }
        : {}),
      tags: [
        SESSION_TAG[kind],
        "session",
        organization.name,
        ...(level ? [level] : []),
      ],
      search: {
        kind: kind === "open-play" ? "open-play" : "lesson",
        resultId: stableUuid(`result:session:${occurrence.id}`),
        entityId: occurrence.id,
        visibility: input.visibility,
        ...(venue ? { venueId: venue.id } : {}),
        timeZone: occurrence.timezone,
        ...(locality ? { locality } : {}),
        sessionOccurrenceId: occurrence.id,
      },
    });
    sessions.set(occurrence.id, {
      occurrence,
      item,
      clubName: organization.name,
    });
  }
  return { candidates, sessions };
}

/** Sessions start and stop being live as time passes: worked out per request. */
export function withLiveSessions(
  candidates: readonly SearchCandidate[],
  now: Date,
): SearchCandidate[] {
  const nowMs = now.getTime();
  return candidates.map((candidate) => {
    if (!candidate.search.sessionOccurrenceId) return candidate;
    const live =
      Date.parse(candidate.startsAt ?? "") <= nowMs &&
      Date.parse(candidate.endsAt ?? "") > nowMs;
    return candidate.live === live ? candidate : { ...candidate, live };
  });
}

/** The clubs a signed-in person belongs to (staff or an active participant). */
export async function organizationsOf(
  database: SearchDatabase,
  personId: string,
): Promise<string[]> {
  const [staff, participants] = await Promise.all([
    database
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.personId, personId)),
    database
      .select({ organizationId: organizationParticipants.organizationId })
      .from(organizationParticipants)
      .where(
        and(
          eq(organizationParticipants.personId, personId),
          eq(organizationParticipants.status, "active"),
        ),
      ),
  ]);
  return [
    ...new Set([...staff, ...participants].map((row) => row.organizationId)),
  ];
}

let cached:
  | { readonly expiresAt: number; readonly value: Promise<CandidateSet> }
  | undefined;

/** Public candidates, reused for a minute (public rows only). */
export function publicCandidates(input: {
  readonly now: Date;
  readonly load: () => Promise<CandidateSet>;
}): { readonly value: Promise<CandidateSet>; readonly cached: boolean } {
  const nowMs = input.now.getTime();
  if (cached && cached.expiresAt > nowMs) {
    return { value: cached.value, cached: true };
  }
  const value = input.load();
  cached = { expiresAt: nowMs + SEARCH_CANDIDATE_LIMITS.cacheMs, value };
  // A failed load is never reused.
  value.catch(() => {
    if (cached?.value === value) cached = undefined;
  });
  return { value, cached: false };
}

export function resetSearchCacheForTests(): void {
  cached = undefined;
}

export { getReadOnlyDatabase };
