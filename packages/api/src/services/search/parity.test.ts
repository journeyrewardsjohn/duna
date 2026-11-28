/**
 * Parity (B10): the server search and the device search give the same
 * answers for the same inputs and the same items. Both run over shared,
 * seeded fixtures; the device side is the unchanged `runDiscoverySearch`
 * the Player Find screen and the site call today.
 */
import { describe, expect, it } from "vitest";
import type { DiscoveryMapItem } from "../../contracts";
import {
  discoveryDistanceMiles,
  KILOMETRES_PER_MILE,
  type DiscoveryWhat,
} from "../../discovery-ranking";
import {
  runDiscoverySearch,
  type DiscoverySearchCriteria,
} from "../../discovery-search";
import {
  criteriaFromInput,
  runSearch,
  type SearchCandidate,
  type SearchCriteria,
} from "./engine";
import {
  CITIES,
  FIXTURE_NOW,
  addDays,
  fixtureCandidates,
  fixtureItems,
  zonedMidnight,
} from "./search.test-support";

const NO_CAP_KM = 50_000;
const WHATS: readonly (readonly DiscoveryWhat[])[] = [
  ["for-you"],
  ["events"],
  ["tournaments"],
  ["leagues"],
  ["training"],
  ["matches"],
  ["court-rentals"],
  ["training", "matches"],
  ["events", "court-rentals", "leagues"],
];
const ZONES = ["America/Los_Angeles", "Australia/Sydney", "Europe/London"];
const RANGES: readonly (readonly [number, number] | null)[] = [
  null,
  [0, 0],
  [0, 6],
  [3, 4],
  [-2, 30],
];

function ended(item: DiscoveryMapItem): boolean {
  const end = Date.parse(item.endsAt ?? item.startsAt ?? "");
  return !item.live && Number.isFinite(end) && end < FIXTURE_NOW.getTime();
}

/** Every page of a server search, in order. */
function allServerIds(
  candidates: readonly SearchCandidate[],
  criteria: SearchCriteria,
  limit = 7,
) {
  const ids: string[] = [];
  let cursor: string | undefined;
  let first: ReturnType<typeof runSearch> | undefined;
  do {
    const run = runSearch(candidates, criteria, {
      now: FIXTURE_NOW,
      limit,
      cursor,
    });
    first ??= run;
    ids.push(...run.page.map((candidate) => candidate.id));
    cursor = run.nextCursor;
  } while (cursor);
  return { ids, first: first! };
}

function deviceCriteria(input: {
  readonly origin?: { latitude: number; longitude: number };
  readonly range: readonly [number, number] | null;
  readonly zone: string;
  readonly what: readonly DiscoveryWhat[];
}): DiscoverySearchCriteria {
  const today = FIXTURE_NOW.toISOString().slice(0, 10);
  return {
    location: input.origin
      ? { mode: "place", label: "Here", ...input.origin }
      : { mode: "anywhere", label: "Anywhere" },
    when: input.range
      ? {
          preset: "custom",
          startsAt: zonedMidnight(
            addDays(today, input.range[0]),
            input.zone,
          ).toISOString(),
          endsAt: new Date(
            zonedMidnight(
              addDays(today, input.range[1] + 1),
              input.zone,
            ).getTime() - 1,
          ).toISOString(),
        }
      : { preset: "flexible" },
    what: input.what,
  };
}

function serverCriteria(input: {
  readonly origin?: { latitude: number; longitude: number };
  readonly radiusKm?: number;
  readonly range: readonly [number, number] | null;
  readonly zone: string;
  readonly what: readonly DiscoveryWhat[];
}): SearchCriteria {
  const today = FIXTURE_NOW.toISOString().slice(0, 10);
  return {
    ...(input.origin
      ? { near: { ...input.origin, radiusKm: input.radiusKm ?? NO_CAP_KM } }
      : {}),
    ...(input.range
      ? {
          when: {
            from: addDays(today, input.range[0]),
            to: addDays(today, input.range[1]),
            timeZone: input.zone,
          },
        }
      : {}),
    dayparts: [],
    kinds: [],
    groups: input.what,
    tags: [],
  };
}

describe("server search = device search (shared ranking)", () => {
  const items = fixtureItems(240, 11);
  const candidates = fixtureCandidates(items);
  const current = items.filter((item) => !ended(item));

  const origins = [undefined, CITIES.manhattanBeach, CITIES.sydney];
  for (const origin of origins) {
    for (const what of WHATS) {
      for (const range of RANGES) {
        for (const zone of ZONES) {
          it(`${origin ? `near ${origin.latitude}` : "anywhere"} · ${what.join("+")} · ${range ? range.join("..") : "any time"} · ${zone}`, () => {
            const device = runDiscoverySearch(
              current,
              deviceCriteria({ origin, range, zone, what }),
            );
            const server = allServerIds(
              candidates,
              serverCriteria({ origin, range, zone, what }),
            );
            expect(server.ids).toEqual(device.items.map((item) => item.id));
            expect(server.first.totalEstimate).toBe(device.items.length);
            expect(server.first.radiusMiles).toBe(device.radiusMiles);
            expect(server.first.expandedWorldwide).toBe(
              device.expandedWorldwide,
            );
          });
        }
      }
    }
  }

  it("a radius cap is the device search without the mapped items outside it", () => {
    for (const radiusKm of [25, 120, 500]) {
      const origin = CITIES.manhattanBeach;
      const inside = current.filter(
        (item) =>
          item.latitude === undefined ||
          discoveryDistanceMiles(origin, item) <=
            radiusKm / KILOMETRES_PER_MILE,
      );
      const device = runDiscoverySearch(
        inside,
        deviceCriteria({ origin, range: null, zone: "UTC", what: ["for-you"] }),
      );
      const server = allServerIds(
        candidates,
        serverCriteria({
          origin,
          radiusKm,
          range: null,
          zone: "UTC",
          what: ["for-you"],
        }),
      );
      expect(server.ids).toEqual(device.items.map((item) => item.id));
    }
  });

  it("the contract input gives the device's answer (For you, a point, dates)", () => {
    const origin = CITIES.sanDiego;
    const zone = "America/Los_Angeles";
    const today = FIXTURE_NOW.toISOString().slice(0, 10);
    const criteria = criteriaFromInput({
      limit: 25,
      where: { near: { ...origin, radiusKm: 500 } },
      when: { from: today, to: addDays(today, 13), timezone: zone },
    });
    const inside = current.filter(
      (item) =>
        item.latitude === undefined ||
        discoveryDistanceMiles(origin, item) <= 500 / KILOMETRES_PER_MILE,
    );
    const device = runDiscoverySearch(
      inside,
      deviceCriteria({ origin, range: [0, 13], zone, what: ["for-you"] }),
    );
    expect(allServerIds(candidates, criteria).ids).toEqual(
      device.items.map((item) => item.id),
    );
  });

  it("holds over several seeds", () => {
    for (const seed of [1, 2, 3, 99, 2026]) {
      const seededItems = fixtureItems(120, seed);
      const seededCandidates = fixtureCandidates(seededItems);
      const seededCurrent = seededItems.filter((item) => !ended(item));
      for (const what of WHATS) {
        const device = runDiscoverySearch(
          seededCurrent,
          deviceCriteria({
            origin: CITIES.newYork,
            range: [0, 20],
            zone: "America/New_York",
            what,
          }),
        );
        const server = allServerIds(
          seededCandidates,
          serverCriteria({
            origin: CITIES.newYork,
            range: [0, 20],
            zone: "America/New_York",
            what,
          }),
          5,
        );
        expect(server.ids).toEqual(device.items.map((item) => item.id));
      }
    }
  });
});
