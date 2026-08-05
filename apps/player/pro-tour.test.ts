import { describe, expect, it } from "vitest";
import type { PublicProCoverage, PublicProEvent } from "@duna/api";
import {
  proEventMediaUrl,
  proEventSections,
  searchProEvents,
  sortProEvents,
} from "./pro-tour";

type ProCoverageEvent = PublicProCoverage["events"][number];

function coverageEvent(overrides: Partial<ProCoverageEvent>): ProCoverageEvent {
  return {
    id: "event-1",
    externalEventId: "external-1",
    slug: "event-1",
    name: "Elite16 Hamburg",
    location: "Hamburg, Germany",
    category: "Elite16",
    genderCategory: "men",
    startsOn: "2026-08-05",
    endsOn: "2026-08-09",
    status: "upcoming",
    live: false,
    teamCount: 16,
    matchCount: 20,
    lastSyncedAt: "2026-08-04T10:00:00.000Z",
    source: "fivb",
    tour: "elite",
    ...overrides,
  };
}

describe("Pro Tour mobile presentation", () => {
  it("keeps live events first and completed events newest first", () => {
    const events = sortProEvents([
      coverageEvent({ id: "old", status: "completed", startsOn: "2026-06-01" }),
      coverageEvent({ id: "next", startsOn: "2026-08-08" }),
      coverageEvent({ id: "live", live: true, status: "live" }),
      coverageEvent({
        id: "recent",
        status: "completed",
        startsOn: "2026-07-01",
      }),
    ]);

    expect(events.map((event) => event.id)).toEqual([
      "live",
      "next",
      "recent",
      "old",
    ]);
  });

  it("searches event, place, category, and tour identity", () => {
    const events = [
      coverageEvent({ id: "fivb" }),
      coverageEvent({
        id: "avp",
        name: "AVP League Championship",
        location: "Los Angeles, USA",
        category: "League",
        source: "avp",
        tour: "avp",
      }),
    ];

    expect(searchProEvents(events, "hamburg").map((event) => event.id)).toEqual(
      ["fivb"],
    );
    expect(searchProEvents(events, "avp").map((event) => event.id)).toEqual([
      "avp",
    ]);
  });

  it("only exposes detail sections backed by event data", () => {
    const event = {
      matches: [{ status: "live", watchOptions: [] }],
      bracket: [{ key: "final", label: "Final", matches: [] }],
      pools: [],
      teamEntries: [],
      liveStandings: [],
      avpLeague: undefined,
      watchOptions: [],
    } as unknown as PublicProEvent;

    expect(proEventSections(event)).toEqual([
      "overview",
      "live",
      "schedule",
      "draw",
    ]);
  });

  it("uses a video poster instead of trying to display video as an image", () => {
    const event = {
      editorial: {
        media: [
          {
            id: "video",
            kind: "hero-video",
            url: "https://example.com/hero.mp4",
            posterUrl: "https://example.com/poster.jpg",
          },
        ],
      },
    } as unknown as PublicProEvent;

    expect(proEventMediaUrl(event)).toBe("https://example.com/poster.jpg");
  });
});
