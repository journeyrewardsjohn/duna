import { describe, expect, it } from "vitest";
import { ROUTES, TABS, type RouteKey } from "../../app/router";
import {
  INTROS,
  introForLocation,
  introToShow,
  isIntroKey,
  parseSeen,
} from "./intro-content";

describe("section intros", () => {
  it("each intro has a Jost title without numerals, three points and a real destination", () => {
    for (const intro of INTROS) {
      expect(intro.title, intro.key).not.toMatch(/\d/);
      expect(intro.points).toHaveLength(3);
      if ("route" in intro.destination)
        expect(Object.keys(ROUTES)).toContain(intro.destination.route);
      else expect(TABS.map((tab) => tab.key)).toContain(intro.destination.tab);
      // Solar is for live states only.
      expect(intro.ground).not.toBe("solar");
    }
  });

  it("each intro is reachable from the place it introduces", () => {
    for (const intro of INTROS) {
      const destination = intro.destination;
      const found =
        "route" in destination
          ? introForLocation(ROUTES[destination.route].tab, destination.route)
          : introForLocation(destination.tab, null);
      expect(found, intro.key).toBe(intro.key);
    }
  });

  it("introduces only sections, not every screen", () => {
    expect(introForLocation("play", null)).toBeNull();
    expect(introForLocation("connect", "messages" as RouteKey)).toBeNull();
    expect(introForLocation("find", null)).toBe("find");
  });

  it("shows an intro once", () => {
    expect(introToShow("wallet", new Set())).toBe("wallet");
    expect(introToShow("wallet", new Set(["wallet"]))).toBeNull();
    expect(introToShow(null, new Set())).toBeNull();
  });

  it("reads only known keys from the store", () => {
    expect([...parseSeen('["find","nope",3,"wallet"]')]).toEqual([
      "find",
      "wallet",
    ]);
    expect(parseSeen("{oops").size).toBe(0);
    expect(parseSeen(null).size).toBe(0);
    expect(isIntroKey("rating")).toBe(true);
  });
});
