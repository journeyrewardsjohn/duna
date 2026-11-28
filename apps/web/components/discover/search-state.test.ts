import { describe, expect, it } from "vitest";
import { legacyDiscoverRedirect } from "./legacy-redirect";
import {
  DEFAULT_DISCOVER_STATE,
  type DiscoverState,
  discoverHref,
  discoverQueryString,
  discoverTitle,
  isDefaultSearch,
  parseDiscoverQuery,
  presetDates,
  whatLabel,
  whenLabel,
  widerRadius,
} from "./search-state";

const now = new Date("2026-11-26T18:00:00.000Z");

function roundTrip(state: DiscoverState) {
  const query = Object.fromEntries(
    new URLSearchParams(discoverQueryString(state)),
  );
  return parseDiscoverQuery(query, now);
}

describe("find a game: state ↔ address", () => {
  it("the default search is the bare page", () => {
    expect(discoverHref(DEFAULT_DISCOVER_STATE)).toBe("/discover");
    expect(parseDiscoverQuery({}, now)).toEqual(DEFAULT_DISCOVER_STATE);
    expect(isDefaultSearch(DEFAULT_DISCOVER_STATE)).toBe(true);
  });

  it.each<DiscoverState>([
    {
      ...DEFAULT_DISCOVER_STATE,
      where: {
        kind: "place",
        label: "Hermosa Beach — Pier Courts",
        address: "Hermosa Beach, CA",
        latitude: 33.8622,
        longitude: -118.4009,
        venueId: "10000000-0000-4000-8000-000000000005",
      },
      when: { kind: "preset", preset: "tomorrow" },
      time: "evening",
      what: ["open", "court"],
      surface: "beach",
      view: "map",
      radius: 5,
    },
    {
      ...DEFAULT_DISCOVER_STATE,
      where: { kind: "near-me", latitude: 25.79, longitude: -80.13 },
      when: { kind: "dates", from: "2026-12-02", to: "2026-12-04" },
      what: ["clinic", "coach"],
    },
    {
      ...DEFAULT_DISCOVER_STATE,
      where: { kind: "text", text: "Hermosa" },
      when: { kind: "dates", from: "2026-12-02", to: "2026-12-02" },
      surface: "indoor",
    },
  ])("round trips %#", (state) => {
    expect(roundTrip(state)).toEqual(state);
    // Canonical: serialising twice gives the same address.
    expect(discoverQueryString(roundTrip(state))).toBe(
      discoverQueryString(state),
    );
  });

  it("reads the old results page's address (emails, apps, the old home)", () => {
    const state = parseDiscoverQuery(
      {
        where: "place",
        location: "Manhattan Beach",
        lat: "33.8847",
        lng: "-118.4109",
        when: "next-7-days",
        start: "2026-11-26T08:00:00.000Z",
        end: "2026-12-03T07:59:59.999Z",
        what: "matches,training,court-rentals",
      },
      now,
    );
    expect(state.where).toMatchObject({
      kind: "place",
      label: "Manhattan Beach",
    });
    expect(state.when).toEqual({ kind: "preset", preset: "week" });
    expect(state.what).toEqual(["open", "clinic", "court"]);
  });

  it("turns an old custom instant range into the visitor's local dates", () => {
    // A Los Angeles visitor's Wednesday 2 December, midnight to midnight.
    expect(
      parseDiscoverQuery(
        {
          when: "custom",
          start: "2026-12-02T08:00:00.000Z",
          end: "2026-12-03T07:59:59.999Z",
        },
        now,
      ).when,
    ).toEqual({ kind: "dates", from: "2026-12-02", to: "2026-12-02" });
    // A Sydney visitor's same day.
    expect(
      parseDiscoverQuery(
        {
          when: "custom",
          start: "2026-12-01T13:00:00.000Z",
          end: "2026-12-02T12:59:59.999Z",
        },
        now,
      ).when,
    ).toEqual({ kind: "dates", from: "2026-12-02", to: "2026-12-02" });
  });

  it("reads the old presets, for-you, focus and flexible", () => {
    expect(
      parseDiscoverQuery({ when: "flexible", what: "for-you" }, now),
    ).toEqual(DEFAULT_DISCOVER_STATE);
    expect(parseDiscoverQuery({ when: "this-month" }, now).when).toEqual({
      kind: "dates",
      from: "2026-11-26",
      to: "2026-11-30",
    });
    expect(parseDiscoverQuery({ when: "next-month" }, now).when).toEqual({
      kind: "dates",
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(parseDiscoverQuery({ focus: "courts" }, now).what).toEqual([
      "court",
    ]);
    expect(
      parseDiscoverQuery({ what: "events", focus: "matches" }, now).what,
    ).toEqual(["event"]);
  });

  it("falls back safely on broken values", () => {
    const state = parseDiscoverQuery(
      {
        where: "current",
        lat: "200",
        lng: "x",
        when: "dates",
        from: "2026-02-31",
        time: "midnight",
        what: "nonsense",
        surface: "grass",
        r: "7",
        view: "globe",
      },
      now,
    );
    expect(state).toEqual(DEFAULT_DISCOVER_STATE);
  });

  it("treats free text in Where as a place to look up (the site search action)", () => {
    expect(parseDiscoverQuery({ where: "Hermosa" }, now).where).toEqual({
      kind: "text",
      text: "Hermosa",
    });
    expect(
      parseDiscoverQuery({ where: "place", location: "Venice" }, now).where,
    ).toEqual({ kind: "text", text: "Venice" });
  });

  it("the old pages redirect with their query string untouched", () => {
    expect(
      legacyDiscoverRedirect(
        { where: "anywhere", what: ["matches"] },
        "/discover",
        { map: true },
      ),
    ).toBe("/discover?where=anywhere&what=matches&view=map");
    expect(legacyDiscoverRedirect({}, "/app/discover")).toBe("/app/discover");
  });

  it("says the search in words", () => {
    const state: DiscoverState = {
      ...DEFAULT_DISCOVER_STATE,
      where: {
        kind: "place",
        label: "Hermosa Beach",
        latitude: 1,
        longitude: 1,
      },
      when: { kind: "preset", preset: "weekend" },
      time: "morning",
      what: ["open", "league"],
      surface: "beach",
    };
    expect(discoverTitle(state)).toBe("Games near Hermosa Beach");
    expect(whenLabel(state.when, state.time)).toBe("This weekend, morning");
    expect(whenLabel({ kind: "preset", preset: "any" }, "evening")).toBe(
      "Any evening",
    );
    expect(whatLabel(state)).toBe("Open games +1 · Beach");
    expect(widerRadius(5)).toBe(10);
    expect(widerRadius(100)).toBeNull();
  });

  it("works out the weekend from any weekday", () => {
    // Thursday 26 November 2026.
    expect(presetDates("weekend", "2026-11-26", 4)).toEqual({
      from: "2026-11-28",
      to: "2026-11-29",
    });
    expect(presetDates("weekend", "2026-11-28", 6)).toEqual({
      from: "2026-11-28",
      to: "2026-11-29",
    });
    expect(presetDates("weekend", "2026-11-29", 0)).toEqual({
      from: "2026-11-29",
      to: "2026-11-29",
    });
    expect(presetDates("tomorrow", "2026-11-30", 1)).toEqual({
      from: "2026-12-01",
      to: "2026-12-01",
    });
  });
});
