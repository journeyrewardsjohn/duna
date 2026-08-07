import { describe, expect, it } from "vitest";
import { aggregateTournamentStatistics } from "./tournament-analytics";

describe("Elite tournament statistics", () => {
  it("aggregates team and player rates and opponent-adjusted observations", () => {
    const statistics = aggregateTournamentStatistics([
      {
        id: "match-1",
        winnerSide: "A",
        setCount: 2,
        teamA: { key: "a", name: "Alpha" },
        teamB: { key: "b", name: "Bravo" },
        statistics: {
          team: [
            { key: "serve", label: "Serve", a: 4, b: 1 },
            { key: "block", label: "Block", a: 2, b: 0 },
            { key: "dig", label: "Dig", a: 8, b: 4 },
          ],
          players: [
            {
              externalPlayerId: "1",
              side: "A",
              name: "Player A",
              total: 20,
              attack: 14,
              block: 2,
              serve: 4,
              errors: 4,
              efficiency: 30,
              attackPoints: 14,
              attackErrors: 2,
              attackAttempts: 24,
              servePoints: 4,
              blockPoints: 2,
              digs: 8,
            },
            {
              externalPlayerId: "2",
              side: "B",
              name: "Player B",
              total: 12,
              attack: 11,
              block: 0,
              serve: 1,
              errors: 7,
              efficiency: 10,
              attackPoints: 11,
              attackErrors: 6,
              attackAttempts: 25,
              servePoints: 1,
              blockPoints: 0,
              digs: 4,
            },
          ],
        },
      },
    ]);
    expect(statistics).toMatchObject({
      coverage: { matchesWithStatistics: 1, totalMatches: 1 },
      teams: [
        {
          key: "a",
          matches: 1,
          wins: 1,
          hittingEfficiency: 50,
          acesPerSet: 2,
          blocksPerSet: 1,
          digsPerSet: 4,
        },
        {
          key: "b",
          matches: 1,
          wins: 0,
          hittingEfficiency: 20,
        },
      ],
      players: expect.arrayContaining([
        expect.objectContaining({ externalPlayerId: "1", points: 20 }),
      ]),
    });
  });

  it("suppresses impossible efficiency from incomplete attack attempts", () => {
    const statistics = aggregateTournamentStatistics([
      {
        id: "partial-match",
        winnerSide: "A",
        setCount: 2,
        teamA: { key: "a", name: "Alpha" },
        teamB: { key: "b", name: "Bravo" },
        statistics: {
          team: [],
          players: [
            {
              externalPlayerId: "1",
              side: "A",
              name: "Player A",
              total: 20,
              attack: 14,
              block: 2,
              serve: 4,
              errors: 0,
              efficiency: 0,
              attackPoints: 14,
              attackErrors: 0,
              attackAttempts: 4,
            },
            {
              externalPlayerId: "2",
              side: "B",
              name: "Player B",
              total: 10,
              attack: 8,
              block: 1,
              serve: 1,
              errors: 0,
              efficiency: 0,
              attackPoints: 8,
              attackErrors: 1,
              attackAttempts: 14,
            },
          ],
        },
      },
    ]);

    expect(
      statistics?.teams.find((team) => team.key === "a"),
    ).not.toHaveProperty("hittingEfficiency");
    expect(statistics?.averages.hittingEfficiency).toBeUndefined();
  });
});
