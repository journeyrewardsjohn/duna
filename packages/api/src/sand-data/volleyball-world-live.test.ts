import { describe, expect, it } from "vitest";
import {
  parseStoredVolleyballWorldMatch,
  parseVolleyballWorldCompetitions,
  parseVolleyballWorldLiveMatch,
  parseVolleyballWorldPlayerStatsHtml,
  parseVolleyballWorldSchedule,
  parseVolleyballWorldTeamStatsHtml,
  parseVolleyballWorldTournamentNumbersFromHtml,
} from "./volleyball-world-live";

describe("Volleyball World live data", () => {
  it("parses the official live score without zero-value placeholder sets", () => {
    expect(
      parseVolleyballWorldLiveMatch({
        no: 544963,
        tournamentNo: 9229,
        tournamentName: "BPT Elite16 Hamburg",
        noTeamA: 3172960,
        noTeamB: 3167686,
        currentSetTeamAPoints: 17,
        currentSetTeamBPoints: 19,
        matchPointsA: 0,
        matchPointsB: 1,
        currentSetNo: 2,
        sets: [
          { no: 0, pointsTeamA: 0, pointsTeamB: 0 },
          { no: 1, pointsTeamA: 21, pointsTeamB: 23 },
          { no: 2, pointsTeamA: 17, pointsTeamB: 19 },
        ],
        status: 1,
        statusLabel: "Live",
        hasLineup: true,
      }),
    ).toMatchObject({
      matchNo: 544963,
      tournamentNo: 9229,
      status: "live",
      currentSetPoints: { a: 17, b: 19 },
      matchPoints: { a: 0, b: 1 },
      sets: [
        { number: 1, a: 21, b: 23 },
        { number: 2, a: 17, b: 19 },
      ],
    });
  });

  it("finds official beach competitions and tournament numbers", () => {
    expect(
      parseVolleyballWorldCompetitions({
        competitions: [
          {
            competitionShortName: "Elite16 - Hamburg, GER - 2026",
            competitionFullName: "Elite16 - Hamburg, GER - 2026",
            url: "/beachvolleyball/competitions/beach-pro-tour/2026/elite16/hamburg-ger/",
            menTournaments: "9229",
            womenTournaments: "9230",
            discipline: "beach",
            startDate: "2026-08-05T07:00:00Z",
            endDate: "2026-08-09T20:00:00Z",
            destination: "Hamburg, Germany",
            subCompetitionType: "Elite",
          },
          {
            competitionFullName: "VNL 2026",
            url: "/volleyball/competitions/volleyball-nations-league/",
            discipline: "volley",
            startDate: "2026-06-01T00:00:00Z",
            endDate: "2026-08-01T00:00:00Z",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        destination: "Hamburg, Germany",
        menTournamentNumbers: [9229],
        womenTournamentNumbers: [9230],
      }),
    ]);
  });

  it("discovers tournament IDs from an official competition page", () => {
    expect(
      parseVolleyballWorldTournamentNumbersFromHtml(`
        <span data-api="https://en-live.volleyballworld.com/api/v1/live/beach/matches/bytournaments/9229;9230"></span>
      `),
    ).toEqual([9229, 9230]);
  });

  it("maps the official schedule match and team flags", () => {
    const schedule = parseVolleyballWorldSchedule({
      matches: [
        {
          matchDateUtc: "2026-08-06T13:00:00",
          gender: "Men",
          matchNo: 544963,
          matchNoInTournament: 4,
          tournamentNo: 9229,
          city: "Hamburg",
          countryCode: "DE",
          country: "Germany",
          matchCenterUrl:
            "/beachvolleyball/competitions/beach-pro-tour/2026/elite16/hamburg-ger/schedule/544963",
          sets: [
            { no: 0, pointsTeamA: 21, pointsTeamB: 23 },
            { no: 1, pointsTeamA: 19, pointsTeamB: 21 },
          ],
          teamANo: 3172960,
          teamBNo: 3167686,
          teamAScore: 0,
          teamBScore: 2,
          phase: { no: 4, name: "Main Draw" },
          roundName: "Pool B",
          courtText: "Court 2",
        },
      ],
      allTeams: [
        {
          no: 3172960,
          code: "BRA",
          country: "Brazil",
          name: "Evandro/Arthur Lanci",
          img: "https://images.volleyballworld.com/flag_bra",
          imgSquared: "https://images.volleyballworld.com/squared/flag_bra",
          tournamentCode: "MHAM2026",
        },
      ],
    });
    expect(schedule.matches[0]).toMatchObject({
      matchNo: 544963,
      matchNoInTournament: 4,
      scheduledAt: "2026-08-06T13:00:00.000Z",
      phase: "Main Draw",
      roundName: "Pool B",
      winnerSide: "B",
    });
    expect(schedule.teams[0]).toMatchObject({
      teamNo: 3172960,
      countryCode: "BRA",
      tournamentCode: "MHAM2026",
    });
  });

  it("parses team and player statistics fragments", () => {
    const teamHtml = `
      <table><tbody>
        <tr class="vbw-o-table__row attack">
          <td class="stats-score -td-teamA"><span>22</span>
          <td class="stats-name">Attack
          <td class="stats-score -td-teamB"><span>24</span>
        <tr class="vbw-o-table__row block">
          <td class="stats-score -td-teamA"><span>1</span>
          <td class="stats-name">Block
          <td class="stats-score -td-teamB"><span>5</span>
      </tbody></table>`;
    const playerHtml = `
      <table data-team=teama data-set=all data-stattype=scoring>
        <tbody>
          <tr class="vbw-o-table__row" data-player-no=133285>
            <td class="playername"><a>Gonçalves Oliveira Júnior</a>
            <td class="total-abs">15
            <td class="attacks">12
            <td class="blocks">1
            <td class="serves">2
            <td class="errors">15
            <td class="efficiency-percentage">0.00
        </tbody>
      </table>
      <table data-team=teamb data-set=all data-stattype=scoring>
        <tbody>
          <tr class="vbw-o-table__row" data-player-no=150000>
            <td class="playername"><a>Opponent</a>
            <td class="total-abs">17
            <td class="attacks">15
            <td class="blocks">0
            <td class="serves">2
            <td class="errors">3
            <td class="efficiency-percentage">22.50
        </tbody>
      </table>
      <table data-stattype=attack data-set=all data-team=teama>
        <tbody>
          <tr data-player-no=133285>
            <td class=playername>Gonçalves Oliveira Júnior
            <td class=point>14
            <td class=errors>6
            <td class=attempts>4
        </tbody>
      </table>
      <table data-team=teama data-set=all data-stattype=serve>
        <tbody>
          <tr data-player-no=133285>
            <td class=playername>Gonçalves Oliveira Júnior
            <td class=point>3
            <td class=errors>6
            <td class=attempts>13
        </tbody>
      </table>
      <table data-team=teama data-set=all data-stattype=dig>
        <tbody>
          <tr data-player-no=133285>
            <td class=playername>Gonçalves Oliveira Júnior
            <td class=digs>5
            <td class=errors>1
        </tbody>
      </table>`;
    expect(parseVolleyballWorldTeamStatsHtml(teamHtml)).toEqual([
      { key: "attack", label: "Attack", a: 22, b: 24 },
      { key: "block", label: "Block", a: 1, b: 5 },
    ]);
    expect(parseVolleyballWorldPlayerStatsHtml(playerHtml)).toEqual([
      {
        externalPlayerId: "133285",
        side: "A",
        name: "Gonçalves Oliveira Júnior",
        total: 15,
        attack: 12,
        block: 1,
        serve: 2,
        errors: 15,
        efficiency: 0,
        attackPoints: 14,
        attackErrors: 6,
        attackAttempts: 24,
        hittingEfficiency: 33.33,
        servePoints: 3,
        serveErrors: 6,
        serveAttempts: 22,
        digs: 5,
        digErrors: 1,
      },
      expect.objectContaining({
        externalPlayerId: "150000",
        side: "B",
        total: 17,
      }),
    ]);
  });

  it("rejects incomplete stored live metadata", () => {
    expect(
      parseStoredVolleyballWorldMatch({ volleyballWorld: {} }),
    ).toBeUndefined();
  });
});
