import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAvpSnapshotWithGateway, parseAvpLeagueHtml } from "./avp";

const leaderboard = (rows: string) => `
  <table class="league__leaderboard-table">
    <tr><th>Rank</th><th>Team</th><th>Matches Played</th><th>Wins</th><th>Losses</th><th>Match Points</th><th>Win %</th></tr>
    ${rows}
  </table>`;

const sampleHtml = `
  <h1>2026 AVP League Season</h1>
  ${leaderboard("<tr><td>1</td><td>Miami Mayhem</td><td>16</td><td>12</td><td>4</td><td>34</td><td>75%</td></tr>")}
  ${leaderboard("<tr><td>1</td><td>Miami Mayhem (Cheng, Kraft)</td><td>8</td><td>5</td><td>3</td><td>14</td><td>62.5%</td></tr>")}
  ${leaderboard("<tr><td>1</td><td>Miami Mayhem (Crabb, Benesh)</td><td>8</td><td>7</td><td>1</td><td>20</td><td>87.5%</td></tr>")}
  <h3>Week 1 - Belmar, NJ</h3>
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
      weeks: [
        {
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
