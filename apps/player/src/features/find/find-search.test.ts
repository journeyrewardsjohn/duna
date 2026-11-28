import type { DiscoveryMapItem } from "@duna/api";
import { participationDemo } from "@duna/core/demo/participation";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CRITERIA,
  criteriaForIntent,
  dunaPlacesMatching,
  groupForItem,
  parseRecents,
  pushRecent,
  runFindSearch,
  toDiscoveryCriteria,
  whatLabel,
  whenForPreset,
  whenForRange,
  whenLabel,
  type FindCriteria,
} from "./find-search";
import { previewSessions, sessionResult } from "./find-sessions";

// Thursday 26 November 2026, 10:00 local.
const now = new Date(2026, 10, 26, 10, 0);

const item = (
  overrides: Partial<DiscoveryMapItem> & Pick<DiscoveryMapItem, "id">,
): DiscoveryMapItem => ({
  entityType: "event",
  kind: "clinic",
  title: `Item ${overrides.id}`,
  subtitle: "Hermosa Beach, CA",
  href: `/events/${overrides.id}`,
  latitude: 33.862,
  longitude: -118.399,
  tags: [],
  ...overrides,
});

const items: DiscoveryMapItem[] = [
  item({ id: "clinic", kind: "clinic", startsAt: "2026-11-28T18:00:00.000Z" }),
  item({
    id: "pickup",
    entityType: "match",
    kind: "pickup",
    startsAt: "2026-12-20T18:00:00.000Z",
  }),
  item({
    id: "club",
    entityType: "organization",
    kind: "club",
    title: "South Bay Volleyball Club",
    organizationId: "10000000-0000-4000-8000-000000000001",
  }),
  item({
    id: "coach",
    entityType: "coach",
    kind: "coach",
    title: "Coach Rivera",
  }),
  item({ id: "tour", entityType: "pro-tour", kind: "tournament", live: true }),
];

describe("When presets", () => {
  it("maps each preset to local dates", () => {
    expect(whenForPreset("today", now)).toEqual({
      preset: "today",
      from: "2026-11-26",
      to: "2026-11-26",
    });
    expect(whenForPreset("tomorrow", now).from).toBe("2026-11-27");
    expect(whenForPreset("this-weekend", now)).toMatchObject({
      from: "2026-11-28",
      to: "2026-11-29",
    });
    expect(whenForPreset("next-7-days", now).to).toBe("2026-12-02");
    expect(whenForPreset("next-30-days", now).to).toBe("2026-12-25");
    expect(whenForPreset("any-time", now)).toEqual({ preset: "any-time" });
  });

  it("names a range after the preset it matches, in either tap order", () => {
    expect(whenForRange("2026-11-29", "2026-11-28", now).preset).toBe(
      "this-weekend",
    );
    expect(whenForRange("2026-12-01", "2026-12-04", now)).toEqual({
      preset: "custom",
      from: "2026-12-01",
      to: "2026-12-04",
    });
    expect(whenLabel(whenForRange("2026-12-01", "2026-12-04", now))).toBe(
      "Tue, Dec 1 – Fri, Dec 4",
    );
    expect(whenLabel({ preset: "any-time" })).toBeNull();
  });
});

describe("search-to-results parameter mapping", () => {
  it("maps Where, When and What onto the discovery search", () => {
    const criteria: FindCriteria = {
      where: {
        kind: "place",
        label: "Hermosa Beach",
        latitude: 33.86,
        longitude: -118.4,
      },
      when: whenForPreset("this-weekend", now),
      what: ["coaches", "matches"],
    };
    const mapped = toDiscoveryCriteria(criteria);
    expect(mapped.location).toMatchObject({
      mode: "place",
      label: "Hermosa Beach",
    });
    expect(mapped.when.preset).toBe("custom");
    expect(new Date(mapped.when.startsAt!).getDate()).toBe(28);
    expect(new Date(mapped.when.endsAt!).getDate()).toBe(29);
    // Coaches are a slice of training in the shared search.
    expect(mapped.what).toEqual(["training", "matches"]);
    expect(toDiscoveryCriteria(EMPTY_CRITERIA)).toMatchObject({
      location: { mode: "anywhere" },
      when: { preset: "flexible" },
      what: ["for-you"],
    });
  });

  it("groups results by What, live first, and keeps only the chosen kinds", () => {
    const all = runFindSearch({
      items,
      sessions: [],
      criteria: EMPTY_CRITERIA,
      sessionResult: (s) => sessionResult(s),
    });
    expect(all.groups.map((group) => group.key)).toEqual([
      "matches",
      "training",
      "tournaments",
      "court-rentals",
      "coaches",
    ]);
    const coaches = runFindSearch({
      items,
      sessions: [],
      criteria: { ...EMPTY_CRITERIA, what: ["coaches"] },
      sessionResult: (s) => sessionResult(s),
    });
    expect(coaches.groups.map((group) => group.key)).toEqual(["coaches"]);
    const weekend = runFindSearch({
      items,
      sessions: [],
      criteria: {
        ...EMPTY_CRITERIA,
        when: whenForPreset("this-weekend", now),
        what: ["matches"],
      },
      sessionResult: (s) => sessionResult(s),
    });
    expect(weekend.total).toBe(0);
  });

  it("adds club sessions with their participation and filters them by When", () => {
    const sessions = previewSessions({
      quotes: participationDemo.quotes,
      club: { id: "c", slug: "south-bay", name: "South Bay Volleyball Club" },
    });
    const outcome = runFindSearch({
      items: [],
      sessions,
      criteria: { ...EMPTY_CRITERIA, what: ["training"] },
      sessionResult: (s) => sessionResult(s),
    });
    const training = outcome.groups.find((group) => group.key === "training")!;
    expect(training.results).toHaveLength(sessions.length);
    expect(
      training.results[0]!.session?.participation?.copy.status,
    ).toBeTruthy();
    const none = runFindSearch({
      items: [],
      sessions,
      criteria: {
        ...EMPTY_CRITERIA,
        when: { preset: "custom", from: "2026-01-01", to: "2026-01-02" },
      },
      sessionResult: (s) => sessionResult(s),
    });
    expect(none.total).toBe(0);
  });

  it("labels What and maps Home shortcuts", () => {
    expect(whatLabel(["for-you"])).toBeNull();
    expect(whatLabel(["matches", "coaches"])).toBe("Matches, Coaches");
    expect(whatLabel(["matches", "coaches", "events"])).toBe("3 kinds");
    expect(criteriaForIntent("book-court", EMPTY_CRITERIA).what).toEqual([
      "court-rentals",
    ]);
    expect(groupForItem(items[3]!)).toBe("coaches");
  });
});

describe("Where", () => {
  const yours = new Set(["10000000-0000-4000-8000-000000000001"]);
  it("lists your Duna clubs first and matches typed text", () => {
    expect(dunaPlacesMatching(items, "", yours).map((i) => i.id)).toEqual([
      "club",
    ]);
    expect(dunaPlacesMatching(items, "south", yours).map((i) => i.id)).toEqual([
      "club",
    ]);
    expect(dunaPlacesMatching(items, "nowhere", yours)).toEqual([]);
  });

  it("keeps five recent places, newest first, never the current location", () => {
    let recents = pushRecent([], {
      kind: "place",
      label: "Hermosa",
      latitude: 1,
      longitude: 2,
    });
    recents = pushRecent(recents, {
      kind: "current",
      label: "Here",
      latitude: 1,
      longitude: 2,
    });
    recents = pushRecent(recents, {
      kind: "place",
      label: "hermosa",
      latitude: 1,
      longitude: 2,
    });
    expect(recents).toHaveLength(1);
    expect(parseRecents(JSON.stringify(recents))).toEqual(recents);
    expect(parseRecents("not json")).toEqual([]);
  });
});
