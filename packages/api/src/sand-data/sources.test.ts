import { describe, expect, it } from "vitest";
import {
  parseFivbEventIndexHtml,
  parseFivbPagePlayers,
  parseVolleyballLifeMatchFeed,
  selectVolleyballLifeDivisionData,
} from "./sources";

describe("FIVB event index parsing", () => {
  it("keeps a country name as a location instead of treating it as a code", () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th></th>
            <th data-field="Name">Name</th>
            <th data-field="Men">Men</th>
            <th data-field="Women">Women</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Future</td>
            <td>BPT Futures Mount Maunganui</td>
            <td><a href="/scripts/tournament.php?tcode=MNZL2026">05.02.-08.02.</a></td>
            <td><a href="/scripts/tournament.php?tcode=WNZL2026">05.02.-08.02.</a></td>
            <td>New Zealand</td>
          </tr>
        </tbody>
      </table>
    `;

    const events = parseFivbEventIndexHtml(html, 2026, "2026-07-31");

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      externalEventId: "MNZL2026",
      location: "New Zealand",
      countryCode: undefined,
      startsOn: "2026-02-05",
      endsOn: "2026-02-08",
      status: "completed",
    });
  });

  it("prefers full entry-list names over abbreviated match-table names", () => {
    const players = parseFivbPagePlayers(`
      <td>
        <a href="https://fivb.12ndr.at/player?player_id=170672&gender=W">Anderson</a>
      </td>
      <td>
        <a href="https://fivb.12ndr.at/player?player_id=170672&gender=W">Madelyne Anderson</a>
      </td>
    `);

    expect(players).toMatchObject([
      {
        externalPersonId: "170672",
        displayName: "Madelyne Anderson",
        isProfessional: true,
      },
    ]);
  });
});

describe("VolleyballLife division hydration", () => {
  it("falls back to embedded tournament data when the hydrate endpoint is empty", () => {
    const embedded = {
      id: 15131,
      teams: [{ id: 74291 }],
      days: [{ id: 1 }],
    };

    expect(
      selectVolleyballLifeDivisionData(
        { id: 15131, teams: [], days: [] },
        embedded,
      ),
    ).toBe(embedded);
  });
});

describe("VolleyballLife match feed parsing", () => {
  it("normalizes doubles scores and preserves the enriched player profile", () => {
    const parsed = parseVolleyballLifeMatchFeed(
      5520,
      {
        results: [
          {
            playerId: 5520,
            playerName: "John Sutton",
            tournamentId: 291,
            tournamentDivisionId: 1531,
            tournament: "Huntington Open",
            division: "Mens Open",
            teamId: 9148,
            matches: [
              {
                matchId: 2238,
                type: "Pool",
                roundName: "Pools",
                date: "2019-05-03T09:30:00Z",
                didWin: false,
                partners: [{ id: 5521, name: "Joe Keller" }],
                opponents: [
                  { id: 3008, name: "Jacob Landel" },
                  { id: 4482, name: "Kylen Winterbotham" },
                ],
                sets: [
                  {
                    setNumber: 1,
                    teamScore: 20,
                    opponentScore: 28,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        externalPersonId: "5520",
        displayName: "John Sutton",
        profileUrl: "https://volleyballlife.com/player/5520",
        hometown: "Charlotte, NC",
        externalRating: 7.982,
        externalRatingConfidence: 58,
        raw: { height: "6' 1\"" },
      },
    );

    expect(parsed.eventCount).toBe(1);
    expect(parsed.players[0]).toMatchObject({
      externalPersonId: "5520",
      hometown: "Charlotte, NC",
      externalRating: 7.982,
      externalRatingConfidence: 58,
    });
    expect(parsed.matches).toMatchObject([
      {
        externalMatchId: "291:1531:2238",
        genderCategory: "men",
        winnerSide: "B",
        sets: [{ a: 20, b: 28 }],
        participants: [
          { externalPersonId: "5520", side: "A" },
          { externalPersonId: "5521", side: "A" },
          { externalPersonId: "3008", side: "B" },
          { externalPersonId: "4482", side: "B" },
        ],
      },
    ]);
  });

  it("keeps scoreless doubles as staged history without rating evidence", () => {
    const parsed = parseVolleyballLifeMatchFeed(
      5520,
      {
        results: [
          {
            playerId: 5520,
            playerName: "John Sutton",
            tournamentId: 292,
            tournamentDivisionId: 1532,
            tournament: "Beach Open",
            division: "Mens Open",
            matches: [
              {
                matchId: 2239,
                type: "Bracket",
                didWin: true,
                partners: [{ id: 5521, name: "Joe Keller" }],
                opponents: [
                  { id: 3008, name: "Jacob Landel" },
                  { id: 4482, name: "Kylen Winterbotham" },
                ],
                sets: [],
              },
            ],
          },
        ],
      },
      {
        externalPersonId: "5520",
        displayName: "John Sutton",
        profileUrl: "https://volleyballlife.com/player/5520",
        raw: {},
      },
    );

    expect(parsed.matches).toMatchObject([
      {
        externalMatchId: "292:1532:2239",
        winnerSide: "A",
        sets: [],
      },
    ]);
  });
});
