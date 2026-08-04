import { describe, expect, it } from "vitest";
import {
  parseAvpLeagueEventPayload,
  parsePlayerSourceProfile,
  professionalEventSlug,
} from "./service";

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
