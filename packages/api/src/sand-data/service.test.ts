import { describe, expect, it } from "vitest";
import {
  dedupeProfessionalMatchRowsForDisplay,
  inferHistoricalPersonId,
  inheritProfessionalEventEditorial,
  matchProfessionalStatisticsToPlayers,
  mergeProfessionalEventPayload,
  parseAvpLeagueEventPayload,
  parsePlayerSourceProfile,
  preferredProfessionalEventCardMedia,
  professionalEventCurrentRound,
  professionalEventSlug,
  professionalMatchCanonicalPath,
  professionalMatchScheduledAt,
  professionalMatchPredictionClosed,
  professionalMatchStatus,
  selectFivbRefreshCandidates,
  shouldBackfillEliteVolleyballWorldEvent,
  shouldAutoLinkProfessionalSource,
  shouldCreateUnclaimedSourceProfile,
} from "./service";
import {
  buildOfficialFivbMatchRecord,
  officialFivbPhase,
  officialFivbTeamRoster,
} from "./volleyball-world-live";

describe("FIVB event detail refresh", () => {
  it("hides a stale fixture duplicate when an official live row is available", () => {
    const participants = [
      { side: "A", name: "Anders Mol" },
      { side: "A", name: "Christian Sørum" },
      { side: "B", name: "Nils Ehlers" },
      { side: "B", name: "Lui Wüst" },
    ];
    const sourceRow = {
      id: "source-row",
      playedAt: new Date("2026-08-06T18:30:00.000Z"),
      rawPayload: { time: "20:30" },
      participants,
      sets: [],
      winnerSide: null,
    };
    const officialRow = {
      ...sourceRow,
      id: "official-row",
      sets: [{ a: 21, b: 16 }],
      rawPayload: {
        time: "20:30",
        volleyballWorld: {
          provider: "volleyball-world",
          transport: "rest",
          matchNo: 544972,
          tournamentNo: 9229,
          status: "live",
          statusLabel: "Live",
          matchPoints: { a: 1, b: 0 },
          sets: [{ number: 1, a: 21, b: 16 }],
          hasLineup: true,
          syncedAt: "2026-08-06T19:03:22.743Z",
          pollingMs: 15_000,
        },
      },
    };
    expect(
      dedupeProfessionalMatchRowsForDisplay([sourceRow, officialRow]).map(
        (row) => row.id,
      ),
    ).toEqual(["official-row"]);
    expect(
      dedupeProfessionalMatchRowsForDisplay([
        sourceRow,
        {
          ...sourceRow,
          id: "later-fixture",
          rawPayload: { time: "21:30" },
        },
      ]).map((row) => row.id),
    ).toEqual(["source-row", "later-fixture"]);
  });

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

  it("limits historical box-score backfill to completed Elite events in the selected year", () => {
    const common = { year: 2026, today: "2026-08-06" } as const;
    expect(
      shouldBackfillEliteVolleyballWorldEvent({
        ...common,
        name: "Elite16 Gstaad",
        category: "Elite 16",
        startsOn: "2026-07-01",
        endsOn: "2026-07-05",
      }),
    ).toBe(true);
    expect(
      shouldBackfillEliteVolleyballWorldEvent({
        ...common,
        name: "BPT Challenger Stare Jablonki",
        category: "Challenger",
        startsOn: "2026-07-30",
        endsOn: "2026-08-02",
      }),
    ).toBe(false);
    expect(
      shouldBackfillEliteVolleyballWorldEvent({
        ...common,
        name: "Elite16 Hamburg",
        startsOn: "2026-08-05",
        endsOn: "2026-08-09",
      }),
    ).toBe(false);
    expect(
      shouldBackfillEliteVolleyballWorldEvent({
        ...common,
        name: "Elite16 Gstaad",
        startsOn: "2025-07-02",
        endsOn: "2025-07-06",
      }),
    ).toBe(false);
  });

  it("maps official legal-name statistics to roster aliases by side and lineup order", () => {
    expect(
      matchProfessionalStatisticsToPlayers({
        statisticNames: ["Gonçalves Oliveira Júnior", "Diego Mariano Lanci"],
        playerNames: ["Evandro", "Arthur Lanci"],
      }),
    ).toEqual([0, 1]);
    expect(
      matchProfessionalStatisticsToPlayers({
        statisticNames: ["Diego Mariano Lanci", "Gonçalves Oliveira Júnior"],
        playerNames: ["Evandro", "Arthur Lanci"],
      }),
    ).toEqual([1, 0]);
    expect(
      matchProfessionalStatisticsToPlayers({
        statisticNames: ["van de Velde", "de Groot"],
        playerNames: ["van de Velde", "de Groot"],
      }),
    ).toEqual([0, 1]);
  });

  it("reconstructs an official main-draw match with phase-safe identity and mapped roster IDs", () => {
    const record = buildOfficialFivbMatchRecord({
      eventExternalId: "MHAM2026",
      eventName: "BPT Elite16 Hamburg",
      eventGender: "men",
      scheduled: {
        matchNo: 544963,
        matchNoInTournament: 4,
        tournamentNo: 9229,
        scheduledAt: "2026-08-06T13:00:00.000Z",
        localStartsAt: "2026-08-06T15:00:00",
        gender: "men",
        phase: "Main Draw",
        roundName: "Pool B",
        court: "Court 2",
        city: "Hamburg",
        country: "Germany",
        teamANo: 3172960,
        teamBNo: 3167686,
        sets: [
          { number: 1, a: 21, b: 23 },
          { number: 2, a: 19, b: 21 },
        ],
        matchPoints: { a: 0, b: 2 },
        winnerSide: "B",
        sourceUrl:
          "https://en.volleyballworld.com/beachvolleyball/competitions/beach-pro-tour/2026/elite16/hamburg-ger/schedule/544963",
        volleyballTvUrl: "https://tv.volleyballworld.com/",
      },
      teamA: {
        teamNo: 3172960,
        name: "Evandro/Arthur Lanci",
        countryCode: "BRA",
      },
      teamB: {
        teamNo: 3167686,
        name: "van de Velde/de Groot",
        countryCode: "NED",
      },
      rosterCandidates: [
        {
          countryCode: "BRA",
          participants: [
            {
              externalPersonId: "133285",
              name: "Evandro Gonçalves Oliveira Júnior",
            },
            {
              externalPersonId: "152000",
              name: "Arthur Diego Mariano Lanci",
            },
          ],
        },
        {
          teamNo: 3167686,
          countryCode: "NED",
          participants: [
            {
              externalPersonId: "143679",
              name: "Steven van de Velde",
              personId: "person-van-de-velde",
            },
            {
              externalPersonId: "188001",
              name: "Alexander Brouwer de Groot",
            },
          ],
        },
      ],
    });

    expect(record).toMatchObject({
      externalMatchId: "MHAM2026:main-draw:4",
      externalEventId: "MHAM2026",
      playedAt: "2026-08-06T13:00:00.000Z",
      roundLabel: "Main Draw - Pool B",
      location: "Hamburg, Germany",
      winnerSide: "B",
      participants: [
        { externalPersonId: "133285", side: "A" },
        { externalPersonId: "152000", side: "A" },
        {
          externalPersonId: "143679",
          personId: "person-van-de-velde",
          side: "B",
        },
        { externalPersonId: "188001", side: "B" },
      ],
      raw: {
        matchNumber: 4,
        phase: "main-draw",
        volleyballWorldMatchNo: 544963,
        time: "15:00",
        court: "Court 2",
      },
    });
  });

  it("matches official abbreviated team names without crossing countries or ambiguous rosters", () => {
    expect(officialFivbPhase("Qualification Tournament")).toBe("qualification");
    expect(officialFivbPhase("Main Draw")).toBe("main-draw");
    expect(officialFivbPhase("Reserve list")).toBeUndefined();
    expect(
      officialFivbTeamRoster({
        team: {
          teamNo: 3172960,
          name: "Evandro/Arthur Lanci",
          countryCode: "BRA",
        },
        candidates: [
          {
            teamNo: 3172960,
            countryCode: "BRA",
            provisional: true,
            participants: [
              {
                externalPersonId: "volleyball-world-team-3172960-player-1",
                name: "Evandro",
              },
              {
                externalPersonId: "volleyball-world-team-3172960-player-2",
                name: "Arthur Lanci",
              },
            ],
          },
          {
            countryCode: "NED",
            participants: [
              { externalPersonId: "wrong-1", name: "Evandro Wrong" },
              { externalPersonId: "wrong-2", name: "Arthur Lanci" },
            ],
          },
          {
            countryCode: "BRA",
            participants: [
              {
                externalPersonId: "133285",
                name: "Evandro Gonçalves Oliveira Júnior",
              },
              {
                externalPersonId: "152000",
                name: "Arthur Diego Mariano Lanci",
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        externalPersonId: "133285",
        name: "Evandro Gonçalves Oliveira Júnior",
      },
      {
        externalPersonId: "152000",
        name: "Arthur Diego Mariano Lanci",
      },
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

  it("creates a full-name pro when the only candidate is a weak surname match", () => {
    expect(
      shouldCreateUnclaimedSourceProfile({
        source: "bvbinfo",
        displayName: "Taylor Crabb",
        candidateCount: 1,
        bestCandidateScoreBps: 7_000,
        isProfessional: true,
      }),
    ).toBe(true);
    expect(
      shouldCreateUnclaimedSourceProfile({
        source: "bvbinfo",
        displayName: "Taylor Crabb",
        candidateCount: 1,
        bestCandidateScoreBps: 9_500,
        isProfessional: true,
      }),
    ).toBe(false);
  });

  it("auto-links only an exact, unique professional source to an unclaimed player", () => {
    expect(
      shouldAutoLinkProfessionalSource({
        source: "bvbinfo",
        externalName: "Taylor Crabb",
        candidateName: "Taylor Crabb",
        candidateClaimStatus: "unclaimed",
        scoreBps: 9_500,
        tied: false,
        isProfessional: true,
      }),
    ).toBe(true);
    expect(
      shouldAutoLinkProfessionalSource({
        source: "bvbinfo",
        externalName: "Crabb",
        candidateName: "Taylor Crabb",
        candidateClaimStatus: "unclaimed",
        scoreBps: 7_000,
        tied: false,
        isProfessional: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoLinkProfessionalSource({
        source: "volleyball-life",
        externalName: "Taylor Crabb",
        candidateName: "Taylor Crabb",
        candidateClaimStatus: "claimed",
        scoreBps: 9_500,
        tied: false,
        isProfessional: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoLinkProfessionalSource({
        source: "fivb-12ndr",
        externalName: "Taylor Crabb",
        candidateName: "Taylor Crabb",
        candidateClaimStatus: "unclaimed",
        scoreBps: 9_500,
        tied: false,
        isProfessional: true,
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

  it("builds a public event-match route for an imported result", () => {
    expect(
      professionalMatchCanonicalPath({
        event: {
          name: "BPT Elite Hamburg - Women's",
          genderCategory: "women",
          startsOn: "2026-08-05",
        },
        matchId: "8d78c8b5-2d18-4755-9ec5-2e4fe75a6d78",
        participants: [
          { name: "Melanie Paul", side: "A" },
          { name: "Anna Behlen", side: "A" },
          { name: "Sandra Ittlinger", side: "B" },
          { name: "Kim van de Velde", side: "B" },
        ],
      }),
    ).toBe(
      "/events/bpt-elite-hamburg-womens-2026-08-05/match/melanie-paul-anna-behlen-vs-sandra-ittlinger-kim-van-de-velde/8d78c8b5-2d18-4755-9ec5-2e4fe75a6d78",
    );
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
  it("prefers an official poster over a featured fallback for event cards", () => {
    expect(
      preferredProfessionalEventCardMedia([
        {
          id: "generated-hero",
          kind: "hero-image",
          url: "https://example.com/generated.jpg",
          alt: "Generated venue atmosphere",
          featured: true,
        },
        {
          id: "official-poster",
          kind: "poster",
          url: "https://example.com/official-poster.jpg",
          alt: "Official Hamburg event poster",
          featured: false,
        },
      ]),
    ).toMatchObject({ id: "official-poster", kind: "poster" });
  });

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
