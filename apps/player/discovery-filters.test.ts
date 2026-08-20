import { describe, expect, it } from "vitest";
import type { DiscoveryMapItem } from "@duna/api";
import {
  discoveryItemMatchesFilter,
  isOpenCommunityMatch,
} from "./discovery-filters";

function item(overrides: Partial<DiscoveryMapItem> = {}): DiscoveryMapItem {
  return {
    id: "event:one",
    entityType: "event",
    kind: "pickup",
    title: "Sunset 4s",
    subtitle: "Pier Courts",
    href: "/events/sunset-4s",
    spotsRemaining: 2,
    tags: [],
    ...overrides,
  };
}

describe("discovery map filters", () => {
  it("puts open hosted play in Matches", () => {
    expect(discoveryItemMatchesFilter(item(), "match")).toBe(true);
    expect(
      discoveryItemMatchesFilter(item({ kind: "open-play" }), "match"),
    ).toBe(true);
  });

  it("keeps pro matches in Pro tour instead of joinable Matches", () => {
    const proMatch = item({ entityType: "match", kind: "match" });
    expect(discoveryItemMatchesFilter(proMatch, "match")).toBe(false);
    expect(discoveryItemMatchesFilter(proMatch, "pro-tour")).toBe(true);
  });

  it("does not advertise full hosted matches as available to join", () => {
    expect(isOpenCommunityMatch(item({ spotsRemaining: 0 }))).toBe(false);
  });
});
