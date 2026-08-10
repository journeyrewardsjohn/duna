import type { DiscoveryMapItem } from "@duna/api";
import { describe, expect, it } from "vitest";
import {
  discoveryDistanceMiles,
  discoveryPresetRange,
  runDiscoverySearch,
  type DiscoverySearchCriteria,
} from "./discovery-search";

const origin = { latitude: 33.8847, longitude: -118.4109 };

function item(
  id: string,
  overrides: Partial<DiscoveryMapItem> = {},
): DiscoveryMapItem {
  return {
    id,
    entityType: "event",
    kind: "open-play",
    title: id,
    subtitle: "Manhattan Beach",
    href: `/events/${id}`,
    latitude: origin.latitude,
    longitude: origin.longitude,
    tags: [],
    ...overrides,
  };
}

function criteria(
  overrides: Partial<DiscoverySearchCriteria> = {},
): DiscoverySearchCriteria {
  return {
    location: { mode: "current", label: "Current location", ...origin },
    when: { preset: "flexible" },
    what: ["for-you"],
    ...overrides,
  };
}

describe("discovery search", () => {
  it("expands through the specified radii until it can show five results", () => {
    const nearby = Array.from({ length: 4 }, (_, index) =>
      item(`near-${index}`, { latitude: origin.latitude + index * 0.01 }),
    );
    const atTwentyMiles = item("twenty-miles", {
      latitude: origin.latitude + 0.29,
    });
    const result = runDiscoverySearch([...nearby, atTwentyMiles], criteria());

    expect(result.radiusMiles).toBe(30);
    expect(result.items).toHaveLength(5);
    expect(result.expandedWorldwide).toBe(false);
  });

  it("returns all matching results worldwide when no radius reaches five", () => {
    const result = runDiscoverySearch(
      [
        item("local"),
        item("far", { latitude: 48.8566, longitude: 2.3522 }),
        item("without-coordinates", {
          latitude: undefined,
          longitude: undefined,
        }),
      ],
      criteria(),
    );

    expect(result.radiusMiles).toBeUndefined();
    expect(result.expandedWorldwide).toBe(true);
    expect(result.items.map((entry) => entry.id)).toEqual([
      "local",
      "far",
      "without-coordinates",
    ]);
  });

  it("filters each requested sport-native result type", () => {
    const items = [
      item("event"),
      item("tournament", { kind: "tournament" }),
      item("league", { kind: "league" }),
      item("coach", { entityType: "coach", kind: "coach" }),
      item("match", { entityType: "match", kind: "match" }),
      item("court", { entityType: "venue", kind: "court-booking" }),
    ];

    expect(
      runDiscoverySearch(
        items,
        criteria({
          location: { mode: "anywhere", label: "Anywhere" },
          what: ["training"],
        }),
      ).items.map((entry) => entry.id),
    ).toEqual(["coach"]);
    expect(
      runDiscoverySearch(
        items,
        criteria({
          location: { mode: "anywhere", label: "Anywhere" },
          what: ["matches", "court-rentals"],
        }),
      ).items.map((entry) => entry.id),
    ).toEqual(["court", "event", "match"]);
  });

  it("uses overlap semantics for a selected date range", () => {
    const range = {
      preset: "custom" as const,
      startsAt: "2026-08-10T00:00:00.000Z",
      endsAt: "2026-08-17T23:59:59.999Z",
    };
    const result = runDiscoverySearch(
      [
        item("during", { startsAt: "2026-08-12T12:00:00.000Z" }),
        item("spans", {
          startsAt: "2026-08-01T12:00:00.000Z",
          endsAt: "2026-08-11T12:00:00.000Z",
        }),
        item("later", { startsAt: "2026-09-01T12:00:00.000Z" }),
        item("court", {
          entityType: "venue",
          kind: "court-booking",
          startsAt: undefined,
        }),
      ],
      criteria({
        location: { mode: "anywhere", label: "Anywhere" },
        when: range,
      }),
    );

    expect(result.items.map((entry) => entry.id)).toEqual([
      "spans",
      "during",
      "court",
    ]);
  });

  it("builds calendar-safe preset windows", () => {
    const now = new Date("2026-08-10T14:30:00-07:00");
    const nextSeven = discoveryPresetRange("next-7-days", now);
    const nextMonth = discoveryPresetRange("next-month", now);

    expect(new Date(nextSeven.startsAt!).getDate()).toBe(10);
    expect(new Date(nextSeven.endsAt!).getDate()).toBe(16);
    expect(new Date(nextMonth.startsAt!).getMonth()).toBe(8);
    expect(new Date(nextMonth.endsAt!).getDate()).toBe(30);
  });

  it("measures miles for result-card context", () => {
    const distance = discoveryDistanceMiles(origin, {
      latitude: 34.0522,
      longitude: -118.2437,
    });
    expect(distance).toBeGreaterThan(10);
    expect(distance).toBeLessThan(20);
  });
});
