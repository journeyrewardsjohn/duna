import { describe, expect, it } from "vitest";
import { parseDiscoverQuery } from "../../discover/search-state";
import { editDistance, fuzzyScore } from "./fuzzy";
import {
  DEFAULT_SEARCH,
  discoveryHref,
  type SearchState,
  toDiscoverState,
  whatText,
  whenRange,
  whenText,
} from "./search-query";

/** Thursday 26 November 2026, 10:00 local. */
const thursday = new Date(2026, 10, 26, 10, 0, 0);

function query(href: string) {
  return Object.fromEntries(new URL(href, "https://duna.coach").searchParams);
}

describe("home search → find-a-game address", () => {
  it("sends a place, this week and two kinds the way /discover reads them", () => {
    const state: SearchState = {
      where: {
        kind: "place",
        label: "Hermosa Beach",
        address: "Hermosa Beach, CA, USA",
        latitude: 33.8622,
        longitude: -118.3995,
        source: "places",
      },
      when: { kind: "preset", preset: "week" },
      what: ["open", "clinic"],
      surface: "beach",
    };
    const href = discoveryHref(state, thursday);
    expect(href.startsWith("/discover?")).toBe(true);
    const params = query(href);
    expect(params).toMatchObject({
      where: "place",
      location: "Hermosa Beach",
      address: "Hermosa Beach, CA, USA",
      lat: "33.86220",
      lng: "-118.39950",
      when: "week",
      what: "open,clinic",
      surface: "beach",
    });
    // The page's own parser gives back the same search.
    expect(parseDiscoverQuery(params, thursday)).toEqual(
      toDiscoverState(state),
    );
  });

  it("defaults to the bare page with this week", () => {
    expect(discoveryHref(DEFAULT_SEARCH, thursday)).toBe("/discover?when=week");
  });

  it("keeps Coaches and Clinics apart", () => {
    const params = query(
      discoveryHref({ ...DEFAULT_SEARCH, what: ["coach", "clinic"] }, thursday),
    );
    expect(params.what).toBe("clinic,coach");
  });

  it("sends Near me as the current location and Any time as nothing", () => {
    const params = query(
      discoveryHref(
        {
          ...DEFAULT_SEARCH,
          where: { kind: "near-me", latitude: 25.79, longitude: -80.13 },
          when: { kind: "preset", preset: "any" },
        },
        thursday,
      ),
    );
    expect(params).toMatchObject({ where: "current", lat: "25.79000" });
    expect(params.when).toBeUndefined();
    expect(parseDiscoverQuery(params).where.kind).toBe("near-me");
  });

  it("works out Tonight and the weekend, and sends a picked day as a date", () => {
    const tonight = whenRange({ kind: "preset", preset: "tonight" }, thursday)!;
    expect(tonight.start.getHours()).toBe(16);
    expect(tonight.end.getDate()).toBe(26);

    const weekend = whenRange({ kind: "preset", preset: "weekend" }, thursday)!;
    expect(weekend.start.getDay()).toBe(6);
    expect(weekend.end.getDay()).toBe(0);
    expect(weekend.start.getDate()).toBe(28);

    const sunday = new Date(2026, 10, 29, 9);
    const sameDay = whenRange({ kind: "preset", preset: "weekend" }, sunday)!;
    expect(sameDay.start.getDate()).toBe(29);
    expect(sameDay.end.getDate()).toBe(29);

    const day = query(
      discoveryHref(
        {
          ...DEFAULT_SEARCH,
          when: { kind: "range", start: "2026-12-02", end: "2026-12-02" },
        },
        thursday,
      ),
    );
    expect(day).toMatchObject({ when: "dates", from: "2026-12-02" });
    expect(parseDiscoverQuery(day).when).toEqual({
      kind: "dates",
      from: "2026-12-02",
      to: "2026-12-02",
    });
  });

  it("says each choice in the row in words", () => {
    expect(whenText({ kind: "preset", preset: "weekend" })).toBe(
      "This weekend",
    );
    expect(
      whenText({ kind: "range", start: "2026-12-02", end: "2026-12-04" }),
    ).toBe("Wed, Dec 2 to Fri, Dec 4");
    expect(whatText({ what: [], surface: "any" })).toBe("Anything");
    expect(whatText({ what: ["open", "league"], surface: "beach" })).toBe(
      "Open games +1 · Beach",
    );
  });
});

describe("Where: typo-tolerant Duna venues", () => {
  it("allows one edit in a 4 to 6 letter word and two in a longer one", () => {
    expect(fuzzyScore("manhatan", "Manhattan Beach Courts")).toBeGreaterThan(0);
    expect(fuzzyScore("hermsoa", "Hermosa Pier Courts")).toBeGreaterThan(0);
    expect(fuzzyScore("pier", "Pier Courts")).toBe(100);
    expect(fuzzyScore("cort", "Pier Courts")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "Pier Courts")).toBe(-1);
    expect(fuzzyScore("mxnhxtxn", "Manhattan Beach")).toBe(-1);
  });

  it("measures edit distance and stops past the limit", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("abc", "abcdefgh", 2)).toBe(3);
  });
});
