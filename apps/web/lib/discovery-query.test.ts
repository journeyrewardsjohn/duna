import { describe, expect, it } from "vitest";
import {
  customDiscoveryRange,
  discoveryCriteriaFromQuery,
  discoveryCriteriaToQuery,
} from "./discovery-query";

describe("public discovery query", () => {
  it("round trips a nearby multi-filter search", () => {
    const criteria = discoveryCriteriaFromQuery({
      where: "place",
      location: "Manhattan Beach",
      address: "Manhattan Beach, CA",
      lat: "33.8847",
      lng: "-118.4109",
      when: "next-7-days",
      what: "tournaments,training",
    });

    expect(criteria.location).toMatchObject({
      mode: "place",
      label: "Manhattan Beach",
      latitude: 33.8847,
      longitude: -118.4109,
    });
    expect(criteria.what).toEqual(["tournaments", "training"]);

    const roundTrip = discoveryCriteriaFromQuery(
      Object.fromEntries(
        new URLSearchParams(discoveryCriteriaToQuery(criteria)).entries(),
      ),
    );
    expect(roundTrip).toEqual(criteria);
  });

  it("fails closed to anywhere and flexible for invalid public parameters", () => {
    const criteria = discoveryCriteriaFromQuery({
      where: "place",
      lat: "400",
      lng: "broken",
      when: "custom",
      start: "tomorrow-ish",
      what: "unknown",
    });
    expect(criteria.location).toEqual({ mode: "anywhere", label: "Anywhere" });
    expect(criteria.when).toEqual({ preset: "flexible" });
    expect(criteria.what).toEqual(["for-you"]);
  });

  it("builds inclusive custom date ranges", () => {
    const range = customDiscoveryRange("2026-08-14", "2026-08-17");
    expect(range?.preset).toBe("custom");
    expect(new Date(range!.startsAt).getDate()).toBe(14);
    expect(new Date(range!.endsAt).getDate()).toBe(17);
    expect(customDiscoveryRange("2026-08-18", "2026-08-17")).toBeUndefined();
  });
});
