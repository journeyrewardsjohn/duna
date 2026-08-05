import { describe, expect, it } from "vitest";
import {
  eventBroadcastCoverage,
  filterProfessionalEvents,
  professionalEventDivisionLabel,
  professionalEventTour,
  type ProfessionalEvent,
} from "./pro-tour-admin-helpers";

function event(
  overrides: Partial<ProfessionalEvent> &
    Pick<ProfessionalEvent, "id" | "name">,
): ProfessionalEvent {
  return {
    category: "Elite16",
    countryCode: undefined,
    endsOn: "2026-08-09",
    editorial: { overrides: {}, media: [] },
    externalEventId: overrides.id,
    genderCategory: "men",
    lastSyncedAt: "2026-08-04T12:00:00.000Z",
    live: false,
    location: undefined,
    matchCount: 0,
    matches: [],
    publicPath: `/events/${overrides.id}`,
    research: { history: [] },
    sourceName: "FIVB",
    sourceSlug: "fivb-12ndr",
    sourceUrl: "https://example.com",
    scraped: {
      name: overrides.name,
      location: undefined,
      category: "Elite16",
      startsOn: "2026-08-05",
      endsOn: "2026-08-09",
    },
    avpSeason: undefined,
    startsOn: "2026-08-05",
    status: "upcoming",
    teamCount: 0,
    watchOptions: [],
    ...overrides,
  };
}

describe("professional event administration filters", () => {
  it("separates AVP from FIVB events", () => {
    expect(
      professionalEventTour(
        event({ id: "avp", name: "AVP Dallas", sourceSlug: "avp-league" }),
      ),
    ).toBe("avp");
  });

  it("labels event divisions clearly in duplicated tour stops", () => {
    expect(
      professionalEventDivisionLabel(
        event({ id: "women", name: "Hamburg", genderCategory: "women" }),
      ),
    ).toBe("Women");
    expect(
      professionalEventDivisionLabel(
        event({ id: "men", name: "Hamburg", genderCategory: "men" }),
      ),
    ).toBe("Men");
  });

  it("keeps live events first and finds events by source context", () => {
    const result = filterProfessionalEvents(
      [
        event({ id: "future", name: "Hamburg", startsOn: "2026-08-05" }),
        event({
          id: "live",
          live: true,
          name: "AVP League Dallas",
          sourceName: "AVP League",
          sourceSlug: "avp-league",
          status: "live",
        }),
      ],
      { query: "avp league", status: "active", tour: "avp" },
    );
    expect(result.map((item) => item.id)).toEqual(["live"]);
  });

  it("counts event defaults and match-level overrides", () => {
    const configured = event({
      id: "watch",
      name: "Hamburg",
      watchOptions: [{ id: "default", kind: "vbtv", label: "VBTV" }],
      matches: [
        {
          id: "match",
          court: undefined,
          gender: "men",
          label: "A / B",
          playedAt: undefined,
          roundLabel: undefined,
          teamAName: "A",
          teamBName: "B",
          time: undefined,
          timezone: undefined,
          watchOptions: [
            {
              id: "center",
              kind: "youtube",
              label: "Center court",
              url: "https://youtube.com/watch?v=123",
            },
          ],
        },
      ],
    });
    expect(eventBroadcastCoverage(configured)).toEqual({
      configured: true,
      defaults: 1,
      matchOverrides: 1,
    });
  });
});
