import { describe, expect, it } from "vitest";
import { buildSandRatingNetwork } from "./sandrating";

const users = [
  {
    id: 1,
    name: "Seed One",
    gender: "male",
    worldRankingRank: 1,
    worldRankingGender: 0,
  },
  {
    id: 2,
    name: "Seed Two",
    gender: "male",
    worldRankingRank: 1,
    worldRankingGender: 0,
  },
  { id: 3, name: "Depth One A", gender: "male" },
  { id: 4, name: "Depth One B", gender: "male" },
  { id: 5, name: "Depth Two A", gender: "male" },
  { id: 6, name: "Depth Two B", gender: "male" },
  { id: 7, name: "Depth Three A", gender: "male" },
  { id: 8, name: "Depth Three B", gender: "male" },
  { id: 101, name: "Women Seed One", gender: "female" },
  { id: 102, name: "Women Seed Two", gender: "female" },
] as const;

function match(
  id: number,
  participants: readonly [number, number, number, number],
  matchDate = `2026-0${id}-01`,
) {
  return {
    match: {
      id,
      team1Player1Id: participants[0],
      team1Player2Id: participants[1],
      team2Player1Id: participants[2],
      team2Player2Id: participants[3],
      winningSide: 1,
      matchDate,
      location: "Partner event",
    },
    sets: [
      { setNumber: 1, team1Score: 21, team2Score: 17 },
      { setNumber: 2, team1Score: 21, team2Score: 19 },
    ],
    verificationStatus: "verified",
  } as const;
}

describe("SandRating network import", () => {
  it("expands ranked seeds locally to the configured graph depth", () => {
    const result = buildSandRatingNetwork({
      users,
      matches: [
        match(1, [1, 2, 3, 4], "7/1-3/2022"),
        match(2, [3, 4, 5, 6]),
        match(3, [5, 6, 7, 8]),
      ],
      rankings: {
        men: [
          {
            teamKey: "M1",
            gender: "men",
            rank: 1,
            points: 1_000,
            player1Name: "Seed One",
            player2Name: "Seed Two",
            player1UserId: 1,
            snapshotDate: "2026-08-04",
          },
        ],
        women: [
          {
            teamKey: "W1",
            gender: "women",
            rank: 1,
            points: 900,
            player1Name: "Women Seed One",
            player2Name: "Women Seed Two",
            player1UserId: 101,
            player2UserId: 102,
            snapshotDate: "2026-08-04",
          },
        ],
      },
      maxDepth: 2,
      topPlayersPerGender: 2,
    });

    expect(result.source).toBe("sandrating");
    expect(result.rankings).toHaveLength(4);
    expect(
      result.players.map((player) => player.externalPersonId).sort(),
    ).toEqual(["1", "2", "3", "4", "5", "6", "101", "102"].sort());
    expect(result.matches.map((row) => row.externalMatchId)).toEqual([
      "1",
      "2",
    ]);
    expect(result.matches[0]).toMatchObject({
      genderCategory: "men",
      sets: [
        { a: 21, b: 17 },
        { a: 21, b: 19 },
      ],
      winnerSide: "A",
      playedAt: "2022-07-01T12:00:00.000Z",
      raw: {
        sourceMatchDate: "7/1-3/2022",
        sourceMatchDateEnd: "2022-07-03",
      },
    });
    expect(result.checkpoint).toMatchObject({
      maxDepth: 2,
      topPlayersPerGender: 2,
      rankingTargets: 4,
      mappedRankingTargets: 4,
      graphDepths: { "0": 4, "1": 2, "2": 2 },
      includedPlayers: 8,
      includedMatches: 2,
    });
    expect(result.players[0]?.raw).not.toHaveProperty("email");
  });

  it("keeps unmatched top-ranked players as claim-ready ranking stubs", () => {
    const result = buildSandRatingNetwork({
      users: [],
      matches: [],
      rankings: {
        men: [],
        women: [
          {
            teamKey: "W42",
            rank: 42,
            points: 321,
            player1Name: "Unmatched One",
            player2Name: "Unmatched Two",
            federationCode: "USA",
            snapshotDate: "2026-08-04",
          },
        ],
      },
      maxDepth: 4,
      topPlayersPerGender: 2,
    });

    expect(result.players).toHaveLength(2);
    expect(result.rankings).toHaveLength(2);
    expect(result.players[0]).toMatchObject({
      externalPersonId: "world:women:unmatched-one:usa",
      displayName: "Unmatched One",
      countryCode: "USA",
      genderCategory: "women",
      isProfessional: true,
      raw: { rankingSeed: true, rankingStub: true },
    });
  });

  it("continues through partnership rows until it has distinct ranked players", () => {
    const result = buildSandRatingNetwork({
      users: [
        { id: 1, name: "Repeat Player", gender: "male" },
        { id: 2, name: "First Partner", gender: "male" },
        { id: 3, name: "Second Partner", gender: "male" },
      ],
      matches: [],
      rankings: {
        women: [],
        men: [
          {
            teamKey: "M1",
            rank: 1,
            player1Name: "Repeat Player",
            player2Name: "First Partner",
            player1UserId: 1,
            player2UserId: 2,
            snapshotDate: "2026-08-04",
          },
          {
            teamKey: "M2",
            rank: 2,
            player1Name: "Repeat Player",
            player2Name: "Second Partner",
            player1UserId: 1,
            player2UserId: 3,
            snapshotDate: "2026-08-04",
          },
        ],
      },
      maxDepth: 1,
      topPlayersPerGender: 3,
    });

    expect(result.rankings?.map((ranking) => ranking.externalPersonId)).toEqual(
      ["1", "2", "3"],
    );
  });

  it("does not map a same-name ranking row to the other division", () => {
    const result = buildSandRatingNetwork({
      users: [{ id: 10, name: "Shaw", gender: "female" }],
      matches: [],
      rankings: {
        women: [],
        men: [
          {
            teamKey: "M1",
            rank: 1,
            player1Name: "Shaw",
            player1UserId: 10,
            federationCode: "USA",
            snapshotDate: "2026-08-04",
          },
        ],
      },
      topPlayersPerGender: 1,
    });

    expect(result.rankings?.[0]?.externalPersonId).toBe("world:men:shaw:usa");
  });
});
