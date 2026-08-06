import { describe, expect, it } from "vitest";
import {
  discoverBvbInfoHistoryPages,
  parseBvbInfoCareerSummary,
  parseFivbEventIndexHtml,
  parseFivbMatchRows,
  parseFivbPagePlayers,
  parseFivbTeamEntries,
  parseVolleyballLifeMatchFeed,
  selectVolleyballLifeDivisionData,
} from "./sources";

describe("BVBInfo career history parsing", () => {
  it("discovers every year-range history page from the player selector", () => {
    expect(
      discoverBvbInfoHistoryPages(`
        <select>
          <option value="1">Career</option>
          <option value="2">Victories</option>
          <option value="5">2011-19</option>
          <option value="6">2020-26</option>
        </select>
      `),
    ).toEqual([5, 6]);
  });

  it("extracts overall events, podiums, and earnings from the career table", () => {
    expect(
      parseBvbInfoCareerSummary(`
        <td colspan="99"><B>Overall</B></td>
        <tr class="clsPlayerDataTotal" align="center" valign="top">
          <td>Total<br>(Rank)</td><td>&nbsp;</td><td>139<br>(140th)</td>
          <td>21<br>(34th)</td><td>16</td><td>24</td><td>3</td>
          <td>22</td><td>2</td><td>22</td>
          <td>$540,875.00<br>(77th)</td>
        </tr>
      `),
    ).toEqual({
      events: 139,
      wins: 21,
      secondPlaceFinishes: 16,
      thirdPlaceFinishes: 24,
      earningsMinor: 54_087_500,
      earningsCurrency: "USD",
    });
  });
});

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

  it("extracts main draw, qualification, reserve, and withdrawn team metadata", () => {
    const teamRow = (
      id: string,
      first: string,
      second: string,
      code: string,
    ) => `
      <tr>
        <td>3060</td><td>11840</td><td>1</td><td>${first}/${second}</td><td>Q</td>
        <td><a href="/player?player_id=${id}1">${first}</a></td>
        <td><a href="/player?player_id=${id}2">${second}</a></td>
        <td>${code}</td><td></td><td>3060</td><td>12020</td>
      </tr>`;
    const html = `
      <h4 id="teams_md">Main</h4><table>${teamRow("1", "Jacob Hölting Nilsson", "Elmer Andersson", "SWE")}</table>
      <h4 id="teams_qu">Qualification</h4><table>${teamRow("2", "Alex", "Blake", "USA")}</table>
      <h4 id="teams_res">Reserve</h4><table>${teamRow("3", "Chris", "Drew", "GER")}</table>
      <h4 id="teams_with">Withdrawn</h4><table>
        <tr><td>3300</td><td>5120</td><td>Cherif/Ahmed</td>
        <td><a href="/player?player_id=41">Cherif</a></td>
        <td><a href="/player?player_id=42">Ahmed</a></td><td>QAT</td><td>Withdrawn</td></tr>
      </table>
    `;

    const entries = parseFivbTeamEntries(html);

    expect(entries.map((entry) => entry.list)).toEqual([
      "main-draw",
      "qualification",
      "reserve",
      "withdrawn",
    ]);
    expect(entries[0]).toMatchObject({
      seed: 1,
      countryCode: "SWE",
      entryPoints: 3060,
      entryTechnicalPoints: 11840,
      seedPoints: 3060,
      seedTechnicalPoints: 12020,
    });
    expect(entries[3]).toMatchObject({
      label: "Cherif/Ahmed",
      countryCode: "QAT",
      entryTag: "Withdrawn",
    });
  });

  it("scopes repeated match numbers to their tournament phase", () => {
    const html = `
      <tr><td>Pool B</td></tr>
      <tr>
        <td>4</td><td>6-Aug</td><td>13:00</td><td>Court 2</td>
        <td><a href="/player?player_id=11">Evandro</a> / <a href="/player?player_id=12">Arthur Lanci</a> BRA</td>
        <td><a href="/player?player_id=21">van de Velde</a> / <a href="/player?player_id=22">de Groot</a> NED</td>
        <td>(21-23, 19-21)</td>
      </tr>`;
    const mainDraw = parseFivbMatchRows(
      html,
      "MHAM2026",
      "BPT Elite16 Hamburg",
      "2026",
      "men",
      "main-draw",
    );
    const qualification = parseFivbMatchRows(
      html,
      "MHAM2026",
      "BPT Elite16 Hamburg",
      "2026",
      "men",
      "qualification",
    );

    expect(mainDraw.matches[0]).toMatchObject({
      externalMatchId: "MHAM2026:main-draw:4",
      raw: { matchNumber: 4, phase: "main-draw" },
    });
    expect(qualification.matches[0]).toMatchObject({
      externalMatchId: "MHAM2026:qualification:4",
      raw: { matchNumber: 4, phase: "qualification" },
    });
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
