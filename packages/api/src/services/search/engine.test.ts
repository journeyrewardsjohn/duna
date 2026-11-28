import { describe, expect, it } from "vitest";
import type { DiscoveryMapItem } from "../../contracts";
import { searchResultsSchema } from "../../contracts/search";
import { SearchCursorError, encodeCursor, decodeCursor } from "./cursor";
import {
  SearchInputError,
  criteriaFromInput,
  runSearch,
  searchKindForItem,
  type SearchCandidate,
  type SearchCriteria,
} from "./engine";
import { toSearchResult } from "./service";
import {
  CITIES,
  FIXTURE_NOW,
  fixtureCandidates,
  fixtureItems,
  fixtureUuid,
  seeded,
} from "./search.test-support";

const now = FIXTURE_NOW;
const EMPTY: SearchCriteria = {
  dayparts: [],
  kinds: [],
  groups: [],
  tags: [],
};

function candidate(
  overrides: Partial<DiscoveryMapItem> & { id: string },
  facts: Partial<SearchCandidate["search"]> = {},
): SearchCandidate {
  const item: DiscoveryMapItem = {
    entityType: "event",
    kind: "clinic",
    title: overrides.id,
    subtitle: "",
    href: `/events/${overrides.id}`,
    tags: [],
    ...overrides,
  };
  return {
    ...item,
    search: {
      kind: searchKindForItem(item),
      resultId: fixtureUuid(seeded(overrides.id.length * 31)),
      entityId: fixtureUuid(seeded(overrides.id.length * 17)),
      visibility: "public",
      timeZone: "America/Los_Angeles",
      ...facts,
    },
  };
}

const ids = (run: { page: readonly SearchCandidate[] }) =>
  run.page.map((entry) => entry.id);

describe("criteria from the contract input", () => {
  it("validates ranges, zones, bounds and dayparts", () => {
    expect(() =>
      criteriaFromInput({
        limit: 25,
        when: { from: "2026-12-02", to: "2026-12-01" },
      }),
    ).toThrow(SearchInputError);
    expect(() =>
      criteriaFromInput({
        limit: 25,
        when: { from: "2026-01-01", to: "2027-01-02" },
      }),
    ).toThrow("Choose dates within one year.");
    expect(() =>
      criteriaFromInput({
        limit: 25,
        when: {
          from: "2026-01-01",
          to: "2026-01-02",
          timezone: "Mars/Olympus",
        },
      }),
    ).toThrow(SearchInputError);
    expect(() =>
      criteriaFromInput({
        limit: 25,
        where: { bounds: { north: 10, south: 0, east: -170, west: 170 } },
      }),
    ).toThrow(SearchInputError);
    expect(() =>
      criteriaFromInput({ limit: 25, what: { tags: ["daypart:midnight"] } }),
    ).toThrow(SearchInputError);
  });

  it("reads dayparts and places from contract fields", () => {
    const venue = "6f1c3b9e-7d22-4c11-9a3e-0b5d2f1e4a77";
    const criteria = criteriaFromInput({
      limit: 25,
      where: { place: `venue:${venue}` },
      what: {
        tags: ["Daypart:Evening", "daypart:morning", "Beach"],
        kinds: ["lesson", "event", "lesson"],
      },
      text: "  Open  PLAY ",
    });
    expect(criteria.dayparts).toEqual(["morning", "evening"]);
    expect(criteria.tags).toEqual(["beach"]);
    expect(criteria.kinds).toEqual(["event", "lesson"]);
    expect(criteria.place).toEqual({ venueId: venue });
    expect(criteria.text).toBe("open play");
    expect(
      criteriaFromInput({ limit: 25, where: { place: "Hermosa" } }).place,
    ).toEqual({
      text: "hermosa",
    });
  });
});

describe("filters", () => {
  const pier = { latitude: 33.8847, longitude: -118.4109 };
  const items = [
    candidate({
      id: "past",
      startsAt: "2026-11-20T17:00:00.000Z",
      endsAt: "2026-11-20T18:00:00.000Z",
    }),
    candidate({
      id: "live-old",
      live: true,
      startsAt: "2026-11-28T17:00:00.000Z",
      endsAt: "2026-11-28T17:30:00.000Z",
    }),
    candidate({
      id: "morning",
      ...pier,
      startsAt: "2026-12-01T17:00:00.000Z",
      endsAt: "2026-12-01T18:00:00.000Z",
      tags: ["Beach"],
    }),
    candidate({
      id: "evening",
      ...pier,
      startsAt: "2026-12-02T03:00:00.000Z",
      endsAt: "2026-12-02T04:00:00.000Z",
      tags: ["indoor"],
    }),
    candidate({
      id: "club",
      entityType: "organization",
      kind: "club",
      organizationId: "11111111-1111-4111-8111-111111111111",
      ...CITIES.newYork,
    }),
    candidate(
      { id: "venue", entityType: "venue", kind: "court-booking", ...pier },
      {
        venueId: "22222222-2222-4222-8222-222222222222",
        locality: "Manhattan Beach",
      },
    ),
    candidate(
      {
        id: "sydney",
        ...CITIES.sydney,
        startsAt: "2026-12-01T22:00:00.000Z",
        endsAt: "2026-12-01T23:00:00.000Z",
      },
      {
        timeZone: "Australia/Sydney",
      },
    ),
  ];

  it("leaves out what already ended unless it is live", () => {
    const run = runSearch(items, EMPTY, { now, limit: 50 });
    expect(ids(run)).not.toContain("past");
    expect(ids(run)).toContain("live-old");
  });

  it("reads When in each venue's own zone unless the searcher gives one", () => {
    const venueLocal = runSearch(
      items,
      { ...EMPTY, when: { from: "2026-12-01", to: "2026-12-01" } },
      { now, limit: 50 },
    );
    // Both LA sessions are on 1 Dec in LA; Sydney's is on 2 Dec in Sydney.
    expect(ids(venueLocal)).toEqual(
      expect.arrayContaining(["morning", "evening"]),
    );
    expect(ids(venueLocal)).not.toContain("sydney");
    const utc = runSearch(
      items,
      {
        ...EMPTY,
        when: { from: "2026-12-01", to: "2026-12-01", timeZone: "UTC" },
      },
      { now, limit: 50 },
    );
    expect(ids(utc)).toContain("sydney");
    expect(ids(utc)).not.toContain("evening");
  });

  it("filters dayparts, tags, kinds, places, bounds and text", () => {
    const run = (criteria: Partial<SearchCriteria>) =>
      ids(runSearch(items, { ...EMPTY, ...criteria }, { now, limit: 50 }));
    expect(run({ dayparts: ["evening"] })).toContain("evening");
    expect(run({ dayparts: ["evening"] })).not.toContain("morning");
    expect(run({ tags: ["beach"] })).toEqual(["morning"]);
    expect(run({ kinds: ["club"] })).toEqual(["club"]);
    expect(
      run({
        place: { organizationId: "11111111-1111-4111-8111-111111111111" },
      }),
    ).toEqual(["club"]);
    expect(
      run({ place: { venueId: "22222222-2222-4222-8222-222222222222" } }),
    ).toEqual(["venue"]);
    expect(run({ place: { text: "manhattan" } })).toEqual(["venue"]);
    expect(
      run({
        bounds: { north: 34.5, south: 33.5, east: -118, west: -119 },
      }).sort(),
    ).toEqual(["evening", "morning", "venue"]);
    expect(run({ text: "even" })).toEqual(["evening"]);
  });

  it("near a point: radius cap, distance and nearest first", () => {
    const result = runSearch(
      items,
      { ...EMPTY, near: { ...CITIES.manhattanBeach, radiusKm: 50 } },
      { now, limit: 50, minimumNearbyResults: 2 },
    );
    expect(ids(result)).not.toContain("club");
    expect(ids(result)).not.toContain("sydney");
    expect(result.radiusMiles).toBe(10);
    expect(result.distanceMiles(items[2]!)).toBeLessThan(1);
  });

  it("returns contract-shaped results, facets and map bounds", () => {
    const run = runSearch(items, EMPTY, { now, limit: 3 });
    const results = {
      items: run.page.map((entry) =>
        toSearchResult(
          entry,
          run,
          entry.search.availability ?? { state: "unknown" },
        ),
      ),
      nextCursor: run.nextCursor,
      totalEstimate: run.totalEstimate,
      facets: run.facets,
      resultBounds: run.resultBounds,
    };
    expect(() => searchResultsSchema.parse(results)).not.toThrow();
    expect(run.totalEstimate).toBe(6);
    expect(
      run.facets.kinds.find((facet) => facet.value === "lesson")?.count,
    ).toBe(4);
    expect(run.resultBounds?.north).toBeCloseTo(CITIES.newYork.latitude);
  });

  it("an empty search is the empty state", () => {
    const run = runSearch(
      items,
      { ...EMPTY, text: "zzzz" },
      { now, limit: 10 },
    );
    expect(run.page).toHaveLength(0);
    expect(run.totalEstimate).toBe(0);
    expect(run.facets.tags).toEqual([]);
    expect(run.resultBounds).toBeUndefined();
  });
});

describe("cursors", () => {
  it("rejects a cursor from another query or a forged one", () => {
    const candidates = fixtureCandidates(fixtureItems(40));
    const first = runSearch(candidates, EMPTY, { now, limit: 5 });
    expect(first.nextCursor).toBeDefined();
    expect(first.nextCursor!.length).toBeLessThanOrEqual(256);
    expect(() =>
      runSearch(
        candidates,
        { ...EMPTY, kinds: ["club"] },
        { now, limit: 5, cursor: first.nextCursor },
      ),
    ).toThrow(SearchCursorError);
    expect(() => decodeCursor("not-a-cursor", "00000000")).toThrow(
      SearchCursorError,
    );
  });

  it("stays short with a very long title", () => {
    const { cursor } = encodeCursor({
      fingerprint: "abcdef01",
      radiusMiles: 480,
      key: [
        4,
        1,
        1234.5678901234,
        1796000000000,
        "T".repeat(400),
        fixtureUuid(seeded(1)),
      ],
    });
    expect(cursor.length).toBeLessThanOrEqual(256);
  });

  /**
   * Property: page through while the data changes between pages (results
   * added, results removed). Every result that was there the whole time is
   * seen exactly once; nothing is ever seen twice.
   */
  it("never repeats or skips while the data changes between pages (seeded)", () => {
    for (const seed of [3, 17, 42, 1234, 9001]) {
      const random = seeded(seed);
      const pool = fixtureCandidates(fixtureItems(90, seed));
      const extra = fixtureCandidates(fixtureItems(60, seed + 1000)).map(
        (entry, index) => ({
          ...entry,
          id: `new-${index}-${entry.id}`,
        }),
      );
      const criteriaList: SearchCriteria[] = [
        EMPTY,
        { ...EMPTY, near: { ...CITIES.manhattanBeach, radiusKm: 500 } },
        { ...EMPTY, text: "open" },
        { ...EMPTY, bounds: { north: 60, south: -40, east: 160, west: -130 } },
      ];
      for (const criteria of criteriaList) {
        const initial = new Set(pool.map((entry) => entry.id));
        const removed = new Set<string>();
        const seen: string[] = [];
        let cursor: string | undefined;
        let current = pool;
        let guard = 0;
        do {
          const run = runSearch(current, criteria, { now, limit: 4, cursor });
          seen.push(...run.page.map((entry) => entry.id));
          cursor = run.nextCursor;
          // Change the data before the next page.
          const next = [...current];
          const added = extra[Math.floor(random() * extra.length)]!;
          if (random() > 0.4 && !next.some((entry) => entry.id === added.id)) {
            next.push(added);
          }
          if (random() > 0.5 && next.length > 0) {
            const index = Math.floor(random() * next.length);
            removed.add(next[index]!.id);
            next.splice(index, 1);
          }
          current = next;
          guard += 1;
        } while (cursor && guard < 500);
        expect(new Set(seen).size).toBe(seen.length);
        const stayed = runSearch(
          pool.filter((entry) => !removed.has(entry.id)),
          criteria,
          { now, limit: 1_000 },
        ).page.map((entry) => entry.id);
        for (const id of stayed) {
          if (initial.has(id)) expect(seen).toContain(id);
        }
      }
    }
  });
});
