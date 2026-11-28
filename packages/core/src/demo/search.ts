/**
 * Demo fixtures: search (owner: B10). One index row per searchable kind
 * around the demo club's South Bay venues (every visibility), the public
 * results a where / when / what query returns (every availability state),
 * facets and typeahead suggestions. Shaped by `contracts/search.ts`.
 */
import { demoOrganization, demoPeople, demoVenues } from "../demo";
import { demoId } from "./ids";

const [pier, hermosa, house] = demoVenues;
const refreshed = "2026-11-27T20:00:00.000Z";
const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});

type Kind =
  | "club"
  | "venue"
  | "public-court"
  | "event"
  | "league"
  | "lesson"
  | "program"
  | "coach"
  | "open-play";
type Visibility = "public" | "members" | "hidden";

const doc = (
  n: number,
  kind: Kind,
  title: string,
  path: string,
  place: { latitude: number; longitude: number; city: string },
  extra: {
    visibility?: Visibility;
    subtitle?: string;
    startsAt?: string;
    endsAt?: string;
    tags?: string[];
    priceFrom?: { amountMinor: number; currency: "USD" };
  } = {},
) => ({
  id: demoId("search", n),
  kind,
  entityId: demoId("search", 100 + n),
  organizationId: demoOrganization.id,
  title,
  ...(extra.subtitle ? { subtitle: extra.subtitle } : {}),
  path,
  visibility: extra.visibility ?? ("public" as Visibility),
  latitude: place.latitude,
  longitude: place.longitude,
  locality: place.city,
  administrativeArea: "CA",
  countryCode: "US",
  ...(extra.startsAt ? { startsAt: extra.startsAt } : {}),
  ...(extra.endsAt ? { endsAt: extra.endsAt } : {}),
  tags: extra.tags ?? [],
  ...(extra.priceFrom ? { priceFrom: extra.priceFrom } : {}),
  rank: 100 - n,
  sourceUpdatedAt: "2026-11-27T19:00:00.000Z",
  refreshedAt: refreshed,
});

export const searchDemoDocuments = [
  doc(
    1,
    "club",
    demoOrganization.name,
    `/clubs/${demoOrganization.slug}`,
    pier!,
    {
      subtitle: "3 venues",
      tags: ["beach", "juniors", "adults"],
    },
  ),
  doc(2, "venue", pier!.name, "/venues/manhattan-beach-pier", pier!, {
    tags: ["beach", "lit"],
  }),
  doc(
    3,
    "public-court",
    "Harbor Sand Courts",
    "/courts/harbor-sand-courts",
    hermosa!,
    {
      tags: ["beach", "free"],
    },
  ),
  doc(
    4,
    "event",
    "Sunset Open Qualifier",
    "/events/sunset-open-qualifier",
    pier!,
    {
      startsAt: "2026-12-05T16:00:00.000Z",
      endsAt: "2026-12-06T01:00:00.000Z",
      tags: ["beach-2s", "open"],
      priceFrom: usd(6000),
    },
  ),
  doc(
    5,
    "league",
    "Thursday Night League",
    "/events/thursday-night-league",
    hermosa!,
    {
      startsAt: "2026-12-03T02:00:00.000Z",
      endsAt: "2027-02-04T05:00:00.000Z",
      tags: ["beach-4s", "intermediate"],
      priceFrom: usd(12000),
      visibility: "members",
    },
  ),
  doc(6, "lesson", "Private lesson", "/offerings/private-lesson", house!, {
    tags: ["private-lesson", "all-levels"],
    priceFrom: usd(15000),
  }),
  doc(
    7,
    "program",
    "Junior Development",
    "/offerings/junior-development",
    house!,
    {
      startsAt: "2027-01-09T17:00:00.000Z",
      endsAt: "2027-03-27T19:00:00.000Z",
      tags: ["juniors", "12-16"],
      priceFrom: usd(24000),
    },
  ),
  doc(
    8,
    "coach",
    demoPeople[0]!.displayName,
    `/coaches/${demoPeople[0]!.handle}`,
    pier!,
    {
      subtitle: "Coach",
      tags: ["private-lesson"],
    },
  ),
  doc(9, "open-play", "Open play", "/events/open-play-saturday", hermosa!, {
    startsAt: "2026-11-29T01:00:00.000Z",
    endsAt: "2026-11-29T04:00:00.000Z",
    tags: ["open-play", "all-levels"],
    priceFrom: usd(1500),
    visibility: "hidden",
  }),
];

const availability = {
  [demoId("search", 1)]: { state: "unknown" as const },
  [demoId("search", 2)]: {
    state: "open" as const,
    summary: "3 courts free at 5 PM",
    nextAvailableAt: "2026-11-28T01:00:00.000Z",
  },
  [demoId("search", 3)]: {
    state: "not-bookable" as const,
    summary: "First come, first served",
  },
  [demoId("search", 4)]: {
    state: "few-left" as const,
    summary: "2 spots left",
  },
  [demoId("search", 6)]: {
    state: "open" as const,
    nextAvailableAt: "2026-11-29T17:00:00.000Z",
  },
  [demoId("search", 7)]: { state: "full" as const, summary: "Waitlist open" },
  [demoId("search", 8)]: { state: "open" as const },
};

export const searchDemoResults = {
  items: searchDemoDocuments
    .filter((document) => document.visibility === "public")
    .map((document) => ({
      id: document.id,
      kind: document.kind,
      entityId: document.entityId,
      title: document.title,
      ...("subtitle" in document ? { subtitle: document.subtitle } : {}),
      path: document.path,
      latitude: document.latitude,
      longitude: document.longitude,
      locality: document.locality,
      ...("startsAt" in document ? { startsAt: document.startsAt } : {}),
      ...("endsAt" in document ? { endsAt: document.endsAt } : {}),
      tags: document.tags,
      ...("priceFrom" in document ? { priceFrom: document.priceFrom } : {}),
      distanceKm: Math.round(document.rank / 10) / 10,
      availability: availability[document.id] ?? { state: "unknown" as const },
    })),
  totalEstimate: 7,
  facets: {
    kinds: [
      { value: "club" as const, label: "Clubs", count: 1 },
      { value: "venue" as const, label: "Venues", count: 1 },
      { value: "public-court" as const, label: "Public courts", count: 1 },
      { value: "event" as const, label: "Events", count: 1 },
      { value: "lesson" as const, label: "Lessons", count: 1 },
      { value: "program" as const, label: "Programs", count: 1 },
      { value: "coach" as const, label: "Coaches", count: 1 },
    ],
    tags: [
      { value: "beach", label: "Beach", count: 3 },
      { value: "juniors", label: "Juniors", count: 2 },
      { value: "private-lesson", label: "Private lessons", count: 2 },
    ],
  },
  resultBounds: { north: 33.93, south: 33.85, east: -118.39, west: -118.42 },
};

/** A query that matches nothing (the EmptyResults state). */
export const searchDemoEmptyResults = {
  items: [],
  totalEstimate: 0,
  facets: { kinds: [], tags: [] },
};

export const searchDemoSuggestions = {
  places: [
    {
      label: "Manhattan Beach, CA",
      latitude: pier!.latitude,
      longitude: pier!.longitude,
    },
    {
      label: "Hermosa Beach, CA",
      latitude: hermosa!.latitude,
      longitude: hermosa!.longitude,
    },
  ],
  results: searchDemoResults.items
    .slice(0, 3)
    .map(({ id, kind, title, path }) => ({
      id,
      kind,
      title,
      path,
    })),
};

export const searchDemo = {
  domain: "search",
  documents: searchDemoDocuments,
  results: searchDemoResults,
  emptyResults: searchDemoEmptyResults,
  suggestions: searchDemoSuggestions,
} as const;
