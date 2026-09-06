import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addAvpChampionshipRoundFallbacks,
  avpLeagueEventIdentity,
  enrichAvpLeagueSnapshotWithFeed,
  normalizeAvpSnapshotWithGateway,
  parseAvpLeagueEventId,
  parseAvpLeagueHtml,
} from "./avp";

const leaderboard = (rows: string) => `
  <table class="league__leaderboard-table">
    <tr><th>Rank</th><th>Team</th><th>Matches Played</th><th>Wins</th><th>Losses</th><th>Match Points</th><th>Win %</th></tr>
    ${rows}
  </table>`;

const sampleHtml = `
  <div id="league-app" data-event-id="51"></div>
  <h1>2026 AVP League Season</h1>
  ${leaderboard("<tr><td>1</td><td>Miami Mayhem</td><td>16</td><td>12</td><td>4</td><td>34</td><td>75%</td></tr>")}
  ${leaderboard("<tr><td>1</td><td>Miami Mayhem (Cheng, Kraft)</td><td>8</td><td>5</td><td>3</td><td>14</td><td>62.5%</td></tr>")}
  ${leaderboard("<tr><td>1</td><td>Miami Mayhem (Crabb, Benesh)</td><td>8</td><td>7</td><td>1</td><td>20</td><td>87.5%</td></tr>")}
  <h3 class="league__competition-heading">Week 1 - Belmar, NJ</h3>
  <table class="league__match-table">
    <tr><th>Date</th><th>Location</th><th>Gender</th><th>Teams</th><th>Set 1</th><th>Set 2</th><th>Set 3</th></tr>
    <tr class="league__match-row league__match-row--top">
      <td>Sat, 5/30</td><td>Belmar Beach</td><td>M</td>
      <td class="league__match-team league__match-team--winner">Miami Mayhem</td>
      <td>15</td><td>15</td><td></td>
    </tr>
    <tr class="league__match-row league__match-row--bottom">
      <td></td><td></td><td></td><td class="league__match-team">Dallas Dream</td>
      <td>10</td><td>12</td><td></td>
    </tr>
  </table>`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AVP League rendered-page parsing", () => {
  it("extracts seasonal rosters, standings, and paired match rows", () => {
    const snapshot = parseAvpLeagueHtml(sampleHtml);

    expect(snapshot).toMatchObject({
      season: 2026,
      cityStandings: [{ teamName: "Miami Mayhem", matchPoints: 34 }],
      rosters: [
        {
          gender: "women",
          teamName: "Miami Mayhem",
          playerNames: ["Cheng", "Kraft"],
        },
        {
          gender: "men",
          teamName: "Miami Mayhem",
          playerNames: ["Crabb", "Benesh"],
        },
      ],
      competitions: [
        {
          key: "week-1",
          kind: "week",
          weekNumber: 1,
          locationLabel: "Belmar, NJ",
          matches: [
            {
              gender: "men",
              teamA: "Miami Mayhem",
              teamB: "Dallas Dream",
              sets: [
                { a: 15, b: 10 },
                { a: 15, b: 12 },
              ],
              winnerSide: "A",
            },
          ],
        },
      ],
    });
    expect(parseAvpLeagueEventId(sampleHtml)).toBe(51);
  });

  it("preserves championship competitions and enriches their bracket rounds", () => {
    const rendered = `${sampleHtml}
      <h3 class="league__competition-heading">League Men's Championships - Chicago, IL</h3>
      <table class="league__match-table">
        <tr><th>Date</th><th>Location</th><th>Gender</th><th>Teams</th><th>Set 1</th><th>Set 2</th><th>Set 3</th></tr>
        <tr class="league__match-row league__match-row--top">
          <td>Sat, 9/5</td><td>Oak Street Beach</td><td>M</td>
          <td class="league__match-team league__match-team--winner">New York Nitro</td>
          <td>10</td><td>15</td><td>15</td>
        </tr>
        <tr class="league__match-row league__match-row--bottom">
          <td></td><td></td><td></td><td>Austin Aces</td>
          <td>15</td><td>8</td><td>12</td>
        </tr>
      </table>`;
    const snapshot = parseAvpLeagueHtml(rendered);

    expect(snapshot.competitions[1]).toMatchObject({
      key: "championship-men",
      label: "League Men's Championships - Chicago, IL",
      kind: "championship",
      weekNumber: null,
      locationLabel: "Chicago, IL",
      genderCategory: "men",
    });
    expect(avpLeagueEventIdentity(2026, snapshot.competitions[1]!)).toEqual({
      externalEventId: "avp:2026:championship-men",
      name: "AVP League Men's Championships — Chicago, IL",
      category: "AVP League Championship",
      genderCategory: "men",
    });

    const enriched = enrichAvpLeagueSnapshotWithFeed(snapshot, [
      {
        EventId: 51,
        EventName: "2026 AVP League Season",
        CompetitionId: 162,
        CompetitionName: "League Men's Championships - Chicago, IL",
        MatchNo: 1,
        Bracket: "Championships",
        Round: "Quaterfinals",
        TeamA: {
          Name: "New York Nitro",
          Captain: { PlayerId: 1, LastName: "Crabb", Gender: "M" },
          Player: { PlayerId: 2, LastName: "Benesh", Gender: "M" },
        },
        TeamB: {
          Name: "Austin Aces",
          Captain: { PlayerId: 3, LastName: "Partain", Gender: "M" },
          Player: { PlayerId: 4, LastName: "Lotman", Gender: "M" },
        },
        Sets: [
          { SetNo: 1, A: 10, B: 15 },
          { SetNo: 2, A: 15, B: 8 },
          { SetNo: 3, A: 15, B: 12 },
        ],
        Winner: 1,
        MatchState: "F",
        MatchSchedule: {
          ScheduleTime: "2026-09-05T11:00:00",
          CourtName: "Oak Street Beach",
          TimeZone: "CST",
        },
      },
    ]);

    expect(enriched.competitions).toEqual([
      expect.objectContaining({
        key: "championship-men",
        matches: [
          expect.objectContaining({
            playedOn: "2026-09-05",
            bracketLabel: "Championships",
            roundLabel: "Quaterfinals",
            sourceCompetitionId: 162,
            sourceMatchNo: 1,
            timezone: "America/Chicago",
            winnerSide: "A",
          }),
        ],
      }),
    ]);
  });

  it("keeps a usable five-match championship bracket when the feed falls back", () => {
    const matches = Array.from({ length: 5 }, (_, index) => ({
      dateText: index < 3 ? "Sat, 9/5" : "Sun, 9/6",
      venue: "Oak Street Beach",
      gender: "men" as const,
      teamA: `Team ${index * 2 + 1}`,
      teamB: `Team ${index * 2 + 2}`,
      sets: [],
      winnerSide: "" as const,
    }));
    const snapshot = addAvpChampionshipRoundFallbacks({
      season: 2026,
      cityStandings: [],
      rosters: [],
      competitions: [
        {
          key: "championship-men",
          label: "League Men's Championships - Chicago, IL",
          kind: "championship",
          weekNumber: null,
          locationLabel: "Chicago, IL",
          genderCategory: "men",
          matches,
        },
      ],
    });

    expect(
      snapshot.competitions[0]?.matches.map((match) => [
        match.sourceMatchNo,
        match.roundLabel,
      ]),
    ).toEqual([
      [1, "Quarterfinals"],
      [2, "Quarterfinals"],
      [3, "Semifinals"],
      [4, "Semifinals"],
      [5, "Finals"],
    ]);
  });

  it("uses Vercel AI Gateway Responses with a provider-qualified model", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    const evidence = parseAvpLeagueHtml(sampleHtml);
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://ai-gateway.vercel.sh/v1/responses");
      const request = JSON.parse(String(init?.body)) as {
        model: string;
        text: { format: { type: string; strict: boolean } };
      };
      expect(request.model).toBe("openai/gpt-5.6-luna");
      expect(request.text.format).toMatchObject({
        type: "json_schema",
        strict: true,
      });
      return new Response(
        JSON.stringify({ output_text: JSON.stringify(evidence) }),
      );
    });

    const normalized = await normalizeAvpSnapshotWithGateway(
      evidence,
      fetchMock,
    );

    expect(normalized.used).toBe(true);
    expect(normalized.snapshot).toEqual(evidence);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps deterministic evidence when Gateway credentials are unavailable", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const evidence = parseAvpLeagueHtml(sampleHtml);

    const normalized = await normalizeAvpSnapshotWithGateway(evidence);

    expect(normalized.used).toBe(false);
    expect(normalized.snapshot).toEqual(evidence);
  });
});
