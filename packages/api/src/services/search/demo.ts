/**
 * Demo mode for search (B10): the same engine over the fixtures in
 * `@duna/core/demo/search` (and the session fixtures in
 * `@duna/core/demo/participation`), so demo answers and tests agree. Hidden
 * rows are never returned; members-only rows only to `player.search`.
 */
import { demoOrganization, demoVenues } from "@duna/core/demo";
import { participationDemo } from "@duna/core/demo/participation";
import { searchDemo } from "@duna/core/demo/search";
import type { DiscoveryMapItem } from "../../contracts";
import type { SearchSession } from "../../contracts/search";
import { discoveryLocalParts } from "../../discovery-ranking";
import { sessionDiscoveryKind, stableUuid } from "./candidates";
import type { SearchCandidate, SearchKind } from "./engine";
import { SearchNotFoundError } from "./session";

/** The fixtures' clock (their refresh time), so demo results never age. */
export const SEARCH_DEMO_NOW = new Date(searchDemo.documents[0]!.refreshedAt);

const ENTITY_TYPE: Record<SearchKind, DiscoveryMapItem["entityType"]> = {
  club: "organization",
  venue: "venue",
  "public-court": "venue",
  coach: "coach",
  event: "event",
  league: "event",
  lesson: "event",
  program: "event",
  "open-play": "event",
};

const availability = new Map<string, SearchCandidate["search"]["availability"]>(
  searchDemo.results.items.map((item) => [item.id, item.availability]),
);

export function demoSearchCandidates(options: {
  readonly includeMembers: boolean;
}): SearchCandidate[] {
  return searchDemo.documents
    .filter(
      (document) =>
        document.visibility === "public" ||
        (options.includeMembers && document.visibility === "members"),
    )
    .map((document) => ({
      id: `demo:${document.id}`,
      entityType: ENTITY_TYPE[document.kind],
      kind: document.kind,
      title: document.title,
      subtitle: ("subtitle" in document ? document.subtitle : undefined) ?? "",
      href: document.path,
      latitude: document.latitude,
      longitude: document.longitude,
      organizationId: document.organizationId,
      ...("startsAt" in document ? { startsAt: document.startsAt } : {}),
      ...("endsAt" in document ? { endsAt: document.endsAt } : {}),
      ...("priceFrom" in document ? { price: document.priceFrom } : {}),
      tags: document.tags,
      search: {
        kind: document.kind,
        resultId: document.id,
        entityId: document.entityId,
        visibility: document.visibility === "members" ? "members" : "public",
        timeZone: demoOrganization.timezone,
        locality: document.locality,
        availability: availability.get(document.id) ?? { state: "unknown" },
      },
    }));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** A participation fixture as a session (one per display state). */
export function demoSearchSession(id: string): SearchSession {
  const quote = participationDemo.quotes.find(
    (candidate) => candidate.subjectId === id,
  );
  if (!quote) throw new SearchNotFoundError();
  const venue = demoVenues[0]!;
  const startsAt = new Date(quote.startsAt);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  const start = discoveryLocalParts(startsAt.getTime(), quote.timezone);
  const end = discoveryLocalParts(endsAt.getTime(), quote.timezone);
  const kind = sessionDiscoveryKind({ subtype: "", title: quote.title });
  return {
    id: quote.subjectId,
    catalogItemId: stableUuid(`demo-item:${quote.subjectId}`),
    title: quote.title,
    sessionKind: kind === "training" ? "group" : kind,
    path: `/clubs/${demoOrganization.slug}`,
    status: quote.displayState === "cancelled-club" ? "cancelled" : "scheduled",
    club: {
      id: demoOrganization.id,
      slug: demoOrganization.slug,
      name: demoOrganization.name,
    },
    venue: {
      name: venue.name,
      latitude: venue.latitude,
      longitude: venue.longitude,
      locality: venue.city,
    },
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: quote.timezone,
    local: {
      date: start.date,
      startTime: `${pad(start.hour)}:${pad(start.minute)}`,
      endTime: `${pad(end.hour)}:${pad(end.minute)}`,
    },
    capacity: quote.display.numbers.capacity,
    spotsLeft: quote.display.numbers.spotsLeft,
    membershipRequired: false,
    prices: quote.display.price
      ? [
          {
            priceId: stableUuid(`demo-price:${quote.subjectId}`),
            kind: "credit",
            audience: "everyone",
            credits: quote.display.price.reservePerPlayer,
          },
        ]
      : [],
    participation: {
      displayState: quote.displayState,
      display: quote.display,
      copy: quote.copy,
    },
    waitlist: {
      available: quote.display.numbers.waiting > 0,
      waiting: quote.display.numbers.waiting,
    },
  };
}
