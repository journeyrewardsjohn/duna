import type { DiscoveryMapItem, VenueSummary } from "@duna/api";
import { participationDisplay, renderParticipationCopy } from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  groupWords,
  lightLine,
  resultKind,
  searchDiscover,
  zoneFor,
} from "./results";
import { DEFAULT_DISCOVER_STATE, type DiscoverState } from "./search-state";

// Thursday 26 November 2026, 10:00 in Los Angeles.
const now = new Date("2026-11-26T18:00:00.000Z");
const org = "11111111-1111-4111-8111-111111111111";

const venues: VenueSummary[] = [
  {
    id: "v-hermosa",
    organizationId: org,
    name: "Hermosa Pier Courts",
    city: "Hermosa Beach",
    region: "CA",
    timezone: "America/Los_Angeles",
    courtCount: 8,
    openNow: true,
    latitude: 33.8622,
    longitude: -118.4009,
    tags: ["Oceanfront"],
  },
  {
    id: "v-house",
    organizationId: org,
    name: "Duna House",
    city: "El Segundo",
    region: "CA",
    timezone: "America/Los_Angeles",
    courtCount: 6,
    openNow: false,
    latitude: 33.9192,
    longitude: -118.4165,
    tags: ["Indoor sand"],
  },
];

function event(
  id: string,
  kind: string,
  startsAt: string,
  extra: Partial<DiscoveryMapItem> = {},
): DiscoveryMapItem {
  return {
    id: `event:${id}`,
    entityType: "event",
    kind,
    title: id,
    subtitle: "Hermosa Pier Courts",
    href: `/events/${id}`,
    latitude: 33.8622,
    longitude: -118.4009,
    organizationId: org,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 2 * 3_600_000).toISOString(),
    tags: [],
    ...extra,
  };
}

const items: DiscoveryMapItem[] = [
  // Thursday 6 PM local (02:00Z Friday).
  event("thursday-pickup", "pickup", "2026-11-27T02:00:00.000Z", {
    spotsRemaining: 3,
    price: { amountMinor: 1500, currency: "USD" },
  }),
  // Thursday 8 AM local: already over at 10 AM.
  event("over", "clinic", "2026-11-26T16:00:00.000Z", {
    endsAt: "2026-11-26T17:00:00.000Z",
  }),
  // Thursday noon local.
  event("thursday-clinic", "clinic", "2026-11-26T20:00:00.000Z", {
    spotsRemaining: 0,
  }),
  // Saturday 9 AM local.
  event("saturday-league", "league", "2026-11-28T17:00:00.000Z", {
    price: { amountMinor: 0, currency: "USD" },
    level: "2.5–3.5",
  }),
  // Saturday morning, indoor, in El Segundo.
  event("indoor-open", "open-play", "2026-11-28T18:00:00.000Z", {
    latitude: 33.9192,
    longitude: -118.4165,
    tags: ["Indoor sand"],
  }),
  {
    id: "venue:v-hermosa",
    entityType: "venue",
    kind: "court-booking",
    title: "Hermosa Pier Courts",
    subtitle: "Hermosa Beach, CA",
    href: "/venues/v-hermosa",
    latitude: 33.8622,
    longitude: -118.4009,
    organizationId: org,
    courtCount: 8,
    openNow: true,
    tags: ["venue"],
  },
  {
    id: "coach:c1",
    entityType: "coach",
    kind: "coach",
    title: "Coach Kai",
    subtitle: "South Bay",
    href: "/coaches/kai",
    latitude: 33.8622,
    longitude: -118.4009,
    organizationId: org,
    tags: [],
  },
];

function run(state: Partial<DiscoverState>) {
  return searchDiscover(
    items,
    venues,
    { ...DEFAULT_DISCOVER_STATE, ...state },
    { now, venueHref: (id) => `/app/venues/${id}` },
  );
}

describe("find a game: results", () => {
  it("groups sessions by day, then time, in the game's own time zone", () => {
    const results = run({});
    expect(results.days.map((day) => day.label)).toEqual([
      "Today · Thu, Nov 26",
      "Sat, Nov 28",
    ]);
    expect(results.days[0]!.rows.map((row) => row.title)).toEqual([
      "thursday-clinic",
      "thursday-pickup",
    ]);
    expect(results.days[0]!.rows[1]!.time).toBe("6:00 PM to 8:00 PM");
    // Sessions that are over are gone.
    expect(results.count).toBe(6);
  });

  it("lists courts, clubs and coaches after the sessions, courts first", () => {
    const results = run({});
    expect(results.places.map((row) => row.kindLabel)).toEqual([
      "Courts",
      "Coach",
    ]);
    // The signed-in twin links venues to the booking page.
    expect(results.places[0]!.href).toBe("/app/venues/v-hermosa");
    expect(results.places[0]!.facts).toBe("8 courts · Open now");
  });

  it("filters by when, the part of the day, what and surface", () => {
    expect(
      run({ when: { kind: "preset", preset: "tonight" } }).days.flatMap((day) =>
        day.rows.map((row) => row.title),
      ),
    ).toEqual(["thursday-pickup"]);
    expect(
      run({
        when: { kind: "preset", preset: "weekend" },
        time: "morning",
      }).days.flatMap((day) => day.rows.map((row) => row.title)),
    ).toEqual(["saturday-league", "indoor-open"]);
    const indoor = run({ surface: "indoor" });
    expect(
      indoor.days.flatMap((day) => day.rows.map((row) => row.title)),
    ).toEqual(["indoor-open"]);
    const courts = run({ what: ["court"] });
    expect(courts.days).toEqual([]);
    expect(courts.places.map((row) => row.title)).toEqual([
      "Hermosa Pier Courts",
    ]);
  });

  it("measures distance and widens the area until it finds enough", () => {
    const results = run({
      where: {
        kind: "place",
        label: "Hermosa Beach",
        latitude: 33.8622,
        longitude: -118.4009,
      },
    });
    expect(results.radiusMiles).toBe(5);
    expect(results.radiusAutomatic).toBe(true);
    expect(results.days[1]!.rows[1]!.distance).toBe("4.0 mi");
    const tight = run({
      where: {
        kind: "place",
        label: "Hermosa Beach",
        latitude: 33.8622,
        longitude: -118.4009,
        venueId: "v-hermosa",
      },
      radius: 1,
    });
    expect(tight.count).toBe(5);
  });

  it("offers the nearest things when nothing matches", () => {
    const results = run({
      where: { kind: "near-me", latitude: 36.97, longitude: -122.03 },
      radius: 5,
    });
    expect(results.count).toBe(0);
    expect(results.nearby).toHaveLength(3);
  });

  it("understands free text as one of Duna's venues", () => {
    const results = run({ where: { kind: "text", text: "hermosa pier" } });
    expect(results.resolvedFrom).toBe("hermosa pier");
    expect(results.whereText).toBe("Hermosa Pier Courts");
    expect(results.origin).toBeDefined();
  });

  it("shows the price all-in and the group state in the shared words", () => {
    const pickup = run({}).days[0]!.rows[1]!;
    expect(pickup.price?.label).toMatch(/^\$\d+\.\d{2} all-in$/);
    expect(pickup.group?.words).toBe("3 spots left");
    const full = run({}).days[0]!.rows[0]!;
    expect(full.group?.words).toBe("Full");
    const free = run({}).days[1]!.rows[0]!;
    expect(free.price?.label).toBe("Free");
    expect(free.level).toBe("Sand Rating 2.5–3.5");
  });

  it("uses the shared participation helper, never its own words", () => {
    const display = participationDisplay({
      capacity: 3,
      booked: 0,
      startsAt: new Date(now.getTime() + 3_600_000),
      endsAt: new Date(now.getTime() + 7_200_000),
      now,
    });
    expect(groupWords(3, now.getTime() + 3_600_000, now)?.words).toBe(
      renderParticipationCopy(display.status),
    );
    expect(groupWords(undefined, now.getTime(), now)).toBeUndefined();
  });

  it("says the light from the sun at that place and hour, or nothing", () => {
    // 6 PM in late November at Hermosa Beach is after sunset.
    expect(
      lightLine(
        33.8622,
        -118.4009,
        Date.parse("2026-11-27T02:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toMatch(/^After dark · sunset 4:4\d PM$/);
    expect(
      lightLine(
        33.8622,
        -118.4009,
        Date.parse("2026-11-26T20:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toMatch(/^Daylight/);
    expect(lightLine(undefined, undefined, 1, "UTC")).toBeUndefined();
  });

  it("kinds and time zones", () => {
    expect(resultKind(items[0]!)).toBe("open");
    expect(resultKind(items[3]!)).toBe("league");
    expect(zoneFor(items[0]!, venues)).toBe("America/Los_Angeles");
    expect(
      zoneFor(
        { latitude: 48.85, longitude: 2.35, organizationId: "x" },
        venues,
      ),
    ).toBe("UTC");
  });
});
