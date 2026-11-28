/**
 * Shared fixtures for the search tests (B10): seeded, so every run sees the
 * same items, and broad (every entity type, live and undated items, items
 * without a map point, equal titles, places on three continents).
 */
import type { DiscoveryMapItem } from "../../contracts";
import { discoveryLocalParts } from "../../discovery-ranking";
import { discoveryCandidates } from "./candidates";
import type { SearchCandidate } from "./engine";

/** A small, fast, seeded generator (mulberry32). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export const FIXTURE_NOW = new Date("2026-11-28T18:00:00.000Z");

export const CITIES = {
  manhattanBeach: { latitude: 33.8847, longitude: -118.4109 },
  sanDiego: { latitude: 32.7157, longitude: -117.1611 },
  newYork: { latitude: 40.7128, longitude: -74.006 },
  sydney: { latitude: -33.8688, longitude: 151.2093 },
  london: { latitude: 51.5072, longitude: -0.1276 },
} as const;

const SHAPES: readonly Pick<DiscoveryMapItem, "entityType" | "kind">[] = [
  { entityType: "organization", kind: "club" },
  { entityType: "venue", kind: "court-booking" },
  { entityType: "coach", kind: "coach" },
  { entityType: "event", kind: "tournament" },
  { entityType: "event", kind: "league" },
  { entityType: "event", kind: "clinic" },
  { entityType: "event", kind: "open-play" },
  { entityType: "event", kind: "pickup" },
  { entityType: "event", kind: "private-lesson" },
  { entityType: "event", kind: "training" },
  { entityType: "event", kind: "lesson" },
  { entityType: "pro-tour", kind: "avp" },
  { entityType: "match", kind: "match" },
];

const TITLES = [
  "Sunset Open",
  "Thursday League",
  "Beginner Clinic",
  "Open Play",
  "Private lesson",
  "South Bay Club",
  "Pier Courts",
  "Coach Rivera",
  "Juniors Training",
  "Open Play",
];

function hex(random: () => number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += Math.floor(random() * 16).toString(16);
  }
  return value;
}

export function fixtureUuid(random: () => number): string {
  return `${hex(random, 8)}-${hex(random, 4)}-4${hex(random, 3)}-8${hex(random, 3)}-${hex(random, 12)}`;
}

/** Discovery items around five cities, dated from 10 days ago to 70 ahead. */
export function fixtureItems(count: number, seed = 7): DiscoveryMapItem[] {
  const random = seeded(seed);
  const cities = Object.values(CITIES);
  const items: DiscoveryMapItem[] = [];
  for (let index = 0; index < count; index += 1) {
    const shape = SHAPES[Math.floor(random() * SHAPES.length)]!;
    const city = cities[Math.floor(random() * cities.length)]!;
    const geocoded = random() > 0.08;
    const dated =
      shape.entityType !== "organization" &&
      shape.entityType !== "venue" &&
      shape.entityType !== "coach";
    const startOffsetHours = Math.round((random() * 80 - 10) * 24);
    const startsAt = new Date(
      FIXTURE_NOW.getTime() + startOffsetHours * 3_600_000,
    );
    const endsAt = new Date(
      startsAt.getTime() + (1 + Math.floor(random() * 48)) * 3_600_000,
    );
    const live =
      dated && startsAt <= FIXTURE_NOW && endsAt > FIXTURE_NOW
        ? random() > 0.3
        : false;
    const uuid = fixtureUuid(random);
    const id =
      shape.entityType === "organization"
        ? `organization:${uuid}:club-${index}`
        : shape.entityType === "coach"
          ? `coach:${fixtureUuid(random)}:${uuid}`
          : `${shape.entityType}:${uuid}`;
    items.push({
      id,
      entityType: shape.entityType,
      kind: shape.kind,
      title: TITLES[Math.floor(random() * TITLES.length)]!,
      subtitle: `${shape.kind} near ${Object.keys(CITIES)[cities.indexOf(city)]}`,
      href: `/fixtures/${index}`,
      ...(geocoded
        ? {
            latitude: city.latitude + (random() - 0.5) * 3,
            longitude: city.longitude + (random() - 0.5) * 3,
          }
        : {}),
      ...(dated
        ? { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }
        : {}),
      ...(live ? { live } : {}),
      tags: [shape.kind, random() > 0.5 ? "beach" : "indoor"],
    });
  }
  return items;
}

/** Items as search candidates (public, read in UTC unless a zone is given). */
export function fixtureCandidates(
  items: readonly DiscoveryMapItem[],
): SearchCandidate[] {
  return discoveryCandidates({
    map: { generatedAt: FIXTURE_NOW.toISOString(), items },
    events: [],
    venues: [],
  });
}

/** The instant a local date starts in a zone (what a device builds). */
export function zonedMidnight(date: string, timeZone: string): Date {
  let guess = Date.parse(`${date}T00:00:00.000Z`);
  for (let step = 0; step < 3; step += 1) {
    const local = discoveryLocalParts(guess, timeZone);
    const localMs = Date.parse(
      `${local.date}T${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}:00.000Z`,
    );
    guess += Date.parse(`${date}T00:00:00.000Z`) - localMs;
  }
  return new Date(guess);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
