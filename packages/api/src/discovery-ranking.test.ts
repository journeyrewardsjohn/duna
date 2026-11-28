import { describe, expect, it } from "vitest";
import {
  compareDiscoverySortKeys,
  daypartOfHour,
  discoveryLocalParts,
  discoveryMatchesDayparts,
  discoveryMatchesInstantRange,
  discoveryMatchesLocalDates,
  discoverySortKey,
  discoveryTextScore,
  normalizeSearchText,
  sortDiscoveryItems,
} from "./discovery-ranking";
import type { DiscoveryMapItem } from "./contracts";
import { zonedMidnight } from "./services/search/search.test-support";

const item = (
  startsAt: string,
  endsAt: string,
): Pick<DiscoveryMapItem, "startsAt" | "endsAt"> => ({ startsAt, endsAt });

describe("venue-local dates", () => {
  it("reads the date where the venue is, not in UTC", () => {
    // 7 PM on 1 Dec in Los Angeles is already 2 Dec in UTC.
    const evening = item(
      "2026-12-02T03:00:00.000Z",
      "2026-12-02T04:30:00.000Z",
    );
    expect(
      discoveryMatchesLocalDates(
        evening,
        { from: "2026-12-01", to: "2026-12-01" },
        "America/Los_Angeles",
      ),
    ).toBe(true);
    expect(
      discoveryMatchesLocalDates(
        evening,
        { from: "2026-12-01", to: "2026-12-01" },
        "UTC",
      ),
    ).toBe(false);
    // 9 AM on 2 Dec in Sydney is still 1 Dec in UTC.
    const morning = item(
      "2026-12-01T22:00:00.000Z",
      "2026-12-01T23:30:00.000Z",
    );
    expect(
      discoveryMatchesLocalDates(
        morning,
        { from: "2026-12-02", to: "2026-12-02" },
        "Australia/Sydney",
      ),
    ).toBe(true);
  });

  it("keeps whole days across daylight-saving changes", () => {
    // Los Angeles springs forward on 8 March 2026 (a 23-hour day) and falls
    // back on 1 November 2026 (a 25-hour day).
    const lateSpring = item(
      "2026-03-09T06:30:00.000Z",
      "2026-03-09T06:45:00.000Z",
    ); // 23:30 PDT 8 Mar
    const earlyFall = item(
      "2026-11-01T08:30:00.000Z",
      "2026-11-01T08:45:00.000Z",
    ); // 01:30 PDT 1 Nov (first)
    const repeated = item(
      "2026-11-01T09:30:00.000Z",
      "2026-11-01T09:45:00.000Z",
    ); // 01:30 PST 1 Nov (second)
    const lateFall = item(
      "2026-11-02T07:30:00.000Z",
      "2026-11-02T07:45:00.000Z",
    ); // 23:30 PST 1 Nov
    const zone = "America/Los_Angeles";
    expect(
      discoveryMatchesLocalDates(
        lateSpring,
        { from: "2026-03-08", to: "2026-03-08" },
        zone,
      ),
    ).toBe(true);
    for (const session of [earlyFall, repeated, lateFall]) {
      expect(
        discoveryMatchesLocalDates(
          session,
          { from: "2026-11-01", to: "2026-11-01" },
          zone,
        ),
      ).toBe(true);
      expect(
        discoveryMatchesLocalDates(
          session,
          { from: "2026-11-02", to: "2026-11-02" },
          zone,
        ),
      ).toBe(false);
    }
    // Sydney falls back on 5 April 2026.
    const sydney = item("2026-04-05T13:30:00.000Z", "2026-04-05T13:45:00.000Z"); // 23:30 AEST 5 Apr
    expect(
      discoveryMatchesLocalDates(
        sydney,
        { from: "2026-04-05", to: "2026-04-05" },
        "Australia/Sydney",
      ),
    ).toBe(true);
  });

  it("equals the device's midnight-to-midnight instant range in the same zone", () => {
    const zones = [
      "America/Los_Angeles",
      "Australia/Sydney",
      "Europe/London",
      "UTC",
    ];
    const days = [
      "2026-03-08",
      "2026-03-29",
      "2026-04-05",
      "2026-11-01",
      "2026-12-15",
    ];
    for (const zone of zones) {
      for (const day of days) {
        const startsAt = zonedMidnight(day, zone).toISOString();
        const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
          .toISOString()
          .slice(0, 10);
        const endsAt = new Date(
          zonedMidnight(next, zone).getTime() - 1,
        ).toISOString();
        for (let minutes = -1_500; minutes <= 3_000; minutes += 37) {
          const start = new Date(Date.parse(startsAt) + minutes * 60_000);
          const session = item(
            start.toISOString(),
            new Date(start.getTime() + 45 * 60_000).toISOString(),
          );
          expect(
            discoveryMatchesLocalDates(session, { from: day, to: day }, zone),
          ).toBe(discoveryMatchesInstantRange(session, { startsAt, endsAt }));
        }
      }
    }
  });

  it("lets undated things through", () => {
    expect(
      discoveryMatchesLocalDates(
        {},
        { from: "2026-12-01", to: "2026-12-01" },
        "UTC",
      ),
    ).toBe(true);
  });
});

describe("dayparts", () => {
  it("splits the day at 5, 12 and 17 venue time", () => {
    expect([4, 5, 11, 12, 16, 17, 23, 0].map(daypartOfHour)).toEqual([
      "evening",
      "morning",
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
      "evening",
    ]);
  });

  it("reads the hour in the venue's zone", () => {
    const session = { startsAt: "2026-12-01T17:00:00.000Z" }; // 9 AM in LA
    expect(
      discoveryMatchesDayparts(session, ["morning"], "America/Los_Angeles"),
    ).toBe(true);
    expect(discoveryMatchesDayparts(session, ["morning"], "UTC")).toBe(false);
    expect(discoveryMatchesDayparts({}, ["evening"], "UTC")).toBe(true);
    expect(
      discoveryLocalParts(Date.parse(session.startsAt), "America/Los_Angeles")
        .hour,
    ).toBe(9);
  });
});

describe("text", () => {
  const venue = {
    title: "Manhattan Beach Pier",
    subtitle: "Manhattan Beach, CA",
    tags: ["beach", "lit"],
  };

  it("ranks the whole title, then a prefix, then a word, then words anywhere", () => {
    expect(discoveryTextScore(venue, "Manhattan Beach Pier")).toBe(4);
    expect(discoveryTextScore(venue, "manhattan")).toBe(3);
    expect(discoveryTextScore(venue, "pier")).toBe(2);
    expect(discoveryTextScore(venue, "lit ca")).toBe(1);
    expect(discoveryTextScore(venue, "indoor")).toBe(0);
  });

  it("ignores case, accents and punctuation, and caps the length", () => {
    expect(normalizeSearchText("  Café—Pier!! ")).toBe("cafe pier");
    expect(normalizeSearchText("x".repeat(500))).toHaveLength(120);
    expect(discoveryTextScore({ ...venue, title: "Café Courts" }, "cafe")).toBe(
      3,
    );
  });
});

describe("order", () => {
  const base = {
    entityType: "event" as const,
    kind: "clinic",
    subtitle: "",
    href: "/x",
    tags: [],
  };

  it("puts live first, then soonest, then title, then id", () => {
    const items: DiscoveryMapItem[] = [
      { ...base, id: "b", title: "B", startsAt: "2026-12-02T00:00:00.000Z" },
      { ...base, id: "a", title: "A", startsAt: "2026-12-02T00:00:00.000Z" },
      { ...base, id: "c", title: "C", startsAt: "2026-12-01T00:00:00.000Z" },
      {
        ...base,
        id: "d",
        title: "D",
        live: true,
        startsAt: "2026-12-05T00:00:00.000Z",
      },
      { ...base, id: "e", title: "A" },
      { ...base, id: "f", title: "A", startsAt: "2026-12-02T00:00:00.000Z" },
    ];
    expect(sortDiscoveryItems(items).map((entry) => entry.id)).toEqual([
      "d",
      "c",
      "a",
      "f",
      "b",
      "e",
    ]);
  });

  it("compares keys exactly as it sorts", () => {
    const left = discoverySortKey({
      id: "1",
      title: "A",
      startsAt: "2026-12-01T00:00:00.000Z",
    });
    const right = discoverySortKey({
      id: "2",
      title: "A",
      startsAt: "2026-12-01T00:00:00.000Z",
    });
    expect(compareDiscoverySortKeys(left, right)).toBeLessThan(0);
    expect(compareDiscoverySortKeys(right, left)).toBeGreaterThan(0);
    expect(compareDiscoverySortKeys(left, left)).toBe(0);
  });
});
