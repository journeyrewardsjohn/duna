import { describe, expect, it } from "vitest";
import {
  inferHistoricalPersonId,
  inheritProfessionalEventEditorial,
  mergeProfessionalEventPayload,
  parseAvpLeagueEventPayload,
  parsePlayerSourceProfile,
  professionalEventCurrentRound,
  professionalEventSlug,
  professionalMatchScheduledAt,
  professionalMatchPredictionClosed,
  professionalMatchStatus,
  selectFivbRefreshCandidates,
  shouldCreateUnclaimedSourceProfile,
} from "./service";

describe("FIVB event detail refresh", () => {
  it("preserves hydrated registration details during a lightweight index refresh", () => {
    const syncedAt = new Date("2026-08-04T14:00:00.000Z");
    expect(
      mergeProfessionalEventPayload({
        incoming: { countryName: "Canada", detailLevel: "index" },
        existing: {
          detailLevel: "tournament",
          detailSyncedAt: "2026-08-03T12:00:00.000Z",
          teamEntries: [{ label: "Crabb / Benesh" }],
          professionalEditorial: {
            overrides: { startsOn: "2026-08-07" },
            media: [{ id: "dallas-poster", kind: "poster" }],
          },
          professionalResearch: {
            latest: { id: "research-proposal", status: "review" },
          },
          watchOptions: [{ id: "vbtv" }],
        },
        syncedAt,
      }),
    ).toMatchObject({
      countryName: "Canada",
      detailLevel: "tournament",
      detailSyncedAt: "2026-08-03T12:00:00.000Z",
      teamEntries: [{ label: "Crabb / Benesh" }],
      professionalEditorial: {
        overrides: { startsOn: "2026-08-07" },
        media: [{ id: "dallas-poster", kind: "poster" }],
      },
      professionalResearch: {
        latest: { id: "research-proposal", status: "review" },
      },
      watchOptions: [{ id: "vbtv" }],
    });
  });

  it("rotates through unhydrated upcoming events before stale hydrated events", () => {
    const selected = selectFivbRefreshCandidates(
      [
        {
          externalEventId: "LIVE",
          live: true,
          startsOn: "2026-08-04",
          rawPayload: {
            detailLevel: "tournament",
            detailSyncedAt: "2026-08-04T13:00:00.000Z",
          },
        },
        {
          externalEventId: "MONTREAL",
          live: false,
          startsOn: "2026-08-19",
          rawPayload: { detailLevel: "index" },
        },
        {
          externalEventId: "STALE",
          live: false,
          startsOn: "2026-08-06",
          rawPayload: {
            detailLevel: "tournament",
            detailSyncedAt: "2026-08-01T12:00:00.000Z",
          },
        },
      ],
      2,
    );
    expect(selected.map((event) => event.externalEventId)).toEqual([
      "LIVE",
      "MONTREAL",
    ]);
  });
});

describe("source identity inference", () => {
  it("reuses a unique same-source identity in future seasons", () => {
    expect(
      inferHistoricalPersonId({
        displayName: "Taylor Crabb",
        previous: [
          {
            normalizedName: "taylor crabb",
            personId: "person-taylor",
          },
        ],
      }),
    ).toBe("person-taylor");
  });

  it("requires review when the historical name maps to multiple people", () => {
    expect(
      inferHistoricalPersonId({
        displayName: "Crabb",
        previous: [
          { normalizedName: "crabb", personId: "person-taylor" },
          { normalizedName: "crabb", personId: "person-trevor" },
        ],
      }),
    ).toBeUndefined();
  });

  it("does not create a new canonical player from an AVP surname alone", () => {
    expect(
      shouldCreateUnclaimedSourceProfile({
        source: "avp-league",
        displayName: "Crabb",
        candidateCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldCreateUnclaimedSourceProfile({
        source: "fivb-12ndr",
        displayName: "Taylor Crabb",
        candidateCount: 0,
      }),
    ).toBe(true);
  });
});

describe("professionalEventSlug", () => {
  it("creates one stable gender segment when the name already includes it", () => {
    expect(
      professionalEventSlug({
        name: "BPT Elite Gstaad - Men's",
        genderCategory: "men",
        startsOn: "2026-07-01",
      }),
    ).toBe("bpt-elite-gstaad-mens-2026-07-01");
  });

  it("normalizes punctuation and women's division labels for SEO", () => {
    expect(
      professionalEventSlug({
        name: "Elite 16 — Montréal | Women",
        genderCategory: "women",
        startsOn: "2026-08-20",
      }),
    ).toBe("elite-16-montreal-womens-2026-08-20");
  });
});

describe("professional live match timing", () => {
  it("combines the source date and local event clock without treating every event match as live", () => {
    const scheduledAt = professionalMatchScheduledAt({
      playedAt: new Date("2026-08-05T12:00:00.000Z"),
      time: "13:00",
      timezone: "Europe/Berlin",
    });
    expect(scheduledAt?.toISOString()).toBe("2026-08-05T11:00:00.000Z");
    expect(
      professionalMatchStatus({
        eventLive: true,
        scheduledAt,
        now: new Date("2026-08-05T10:00:00.000Z"),
      }),
    ).toBe("scheduled");
    expect(
      professionalMatchStatus({
        eventLive: true,
        scheduledAt,
        now: new Date("2026-08-05T11:20:00.000Z"),
      }),
    ).toBe("live");
    expect(
      professionalMatchStatus({
        eventLive: true,
        hasScore: true,
      }),
    ).toBe("live");
    expect(
      professionalMatchStatus({
        eventLive: true,
        hasScore: true,
        winnerSide: "A",
      }),
    ).toBe("completed");
    expect(
      professionalMatchPredictionClosed({
        status: "scheduled",
        scheduledAt,
        now: new Date("2026-08-05T11:01:00.000Z"),
      }),
    ).toBe(true);
    expect(
      professionalMatchPredictionClosed({
        status: "scheduled",
        scheduledAt,
        now: new Date("2026-08-05T10:59:00.000Z"),
      }),
    ).toBe(false);
  });

  it("uses the active match round before the next scheduled round", () => {
    expect(
      professionalEventCurrentRound(
        [
          {
            roundLabel: "Pool B (Standings)",
            status: "live",
            scheduledAt: "2026-08-05T15:00:00.000Z",
          },
          {
            roundLabel: "Quarterfinals",
            status: "scheduled",
            scheduledAt: "2026-08-06T15:00:00.000Z",
          },
        ],
        new Date("2026-08-05T15:30:00.000Z"),
      ),
    ).toBe("Pool B");
  });
});

describe("professional event division details", () => {
  it("uses event-wide sibling details only when this division is missing them", () => {
    expect(
      inheritProfessionalEventEditorial(
        {
          overrides: {},
          media: [],
          summary: "Men's division summary",
        },
        {
          overrides: { location: "Hamburg, Germany" },
          media: [
            {
              id: "hamburg-poster",
              kind: "poster",
              url: "https://example.com/hamburg.jpg",
              alt: "Hamburg event poster",
              featured: true,
            },
          ],
          summary: "Shared event summary",
          venueName: "Hamburg-Horn racecourse",
          venueAddress: "Rennbahnstraße 96, Hamburg",
          timezone: "Europe/Berlin",
        },
      ),
    ).toMatchObject({
      overrides: {},
      summary: "Men's division summary",
      venueName: "Hamburg-Horn racecourse",
      venueAddress: "Rennbahnstraße 96, Hamburg",
      timezone: "Europe/Berlin",
      media: [{ id: "hamburg-poster" }],
    });
  });

  it("keeps division-specific details when both divisions are configured", () => {
    expect(
      inheritProfessionalEventEditorial(
        {
          overrides: {},
          media: [],
          venueName: "Men's venue",
          timezone: "America/Chicago",
        },
        {
          overrides: {},
          media: [],
          venueName: "Women's venue",
          timezone: "Europe/Berlin",
        },
      ),
    ).toMatchObject({
      venueName: "Men's venue",
      timezone: "America/Chicago",
    });
  });
});

describe("parseAvpLeagueEventPayload", () => {
  it("keeps men's, women's, and overall club standings distinct", () => {
    expect(
      parseAvpLeagueEventPayload({
        source: "avp-league",
        season: 2026,
        cityStandings: [
          {
            rank: 1,
            teamName: "Miami Mayhem",
            matchesPlayed: 16,
            wins: 13,
            losses: 3,
            matchPoints: 34,
            winPercentage: 81.25,
          },
        ],
        rosters: [
          {
            rank: 1,
            teamName: "Miami Mayhem",
            matchesPlayed: 8,
            wins: 7,
            losses: 1,
            matchPoints: 20,
            winPercentage: 87.5,
            gender: "men",
            playerNames: ["Crabb", "Benesh"],
          },
          {
            rank: 2,
            teamName: "Miami Mayhem",
            matchesPlayed: 8,
            wins: 6,
            losses: 2,
            matchPoints: 14,
            winPercentage: 75,
            gender: "women",
            playerNames: ["Cheng", "Kraft"],
          },
        ],
      }),
    ).toMatchObject({
      season: 2026,
      overall: [{ rank: 1, teamName: "Miami Mayhem", matchPoints: 34 }],
      men: [
        {
          rank: 1,
          teamName: "Miami Mayhem",
          matchPoints: 20,
          playerNames: ["Crabb", "Benesh"],
        },
      ],
      women: [
        {
          rank: 2,
          teamName: "Miami Mayhem",
          matchPoints: 14,
          playerNames: ["Cheng", "Kraft"],
        },
      ],
    });
  });
});

describe("parsePlayerSourceProfile", () => {
  it("normalizes VolleyballLife player links to a stable source identity", () => {
    expect(
      parsePlayerSourceProfile(
        "volleyball-life",
        "https://www.volleyballlife.com/playerprofile/000653?tab=matches",
      ),
    ).toEqual({
      externalId: "653",
      profileUrl: "https://volleyballlife.com/player/653",
      apiProfileUrl: "https://api-v8.volleyballlife.com/playerprofile/653",
    });
  });

  it("accepts the current public player URL used by VolleyballLife", () => {
    expect(
      parsePlayerSourceProfile(
        "volleyball-life",
        "https://volleyballlife.com/player/5520",
      ),
    ).toEqual({
      externalId: "5520",
      profileUrl: "https://volleyballlife.com/player/5520",
      apiProfileUrl: "https://api-v8.volleyballlife.com/playerprofile/5520",
    });
  });

  it("normalizes the private API endpoint back to its public profile", () => {
    expect(
      parsePlayerSourceProfile(
        "volleyball-life",
        "https://api-v8.volleyballlife.com/playerprofile/5520",
      ),
    ).toEqual({
      externalId: "5520",
      profileUrl: "https://volleyballlife.com/player/5520",
      apiProfileUrl: "https://api-v8.volleyballlife.com/playerprofile/5520",
    });
  });

  it("accepts a BVBInfo numeric player id", () => {
    expect(parsePlayerSourceProfile("bvbinfo", "8737")).toEqual({
      externalId: "8737",
      profileUrl: "http://www.bvbinfo.com/player.asp?ID=8737&Page=1",
    });
  });

  it("rejects lookalike source domains", () => {
    expect(() =>
      parsePlayerSourceProfile(
        "volleyball-life",
        "https://volleyballlife.example/playerprofile/653",
      ),
    ).toThrow("VolleyballLife");
  });
});
