import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTournamentInsights } from "./tournament-insights";

describe("tournament insights", () => {
  afterEach(() => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_TOURNAMENT_ANALYTICS_MODEL;
  });

  it("uses a provider-qualified model through Vercel AI Gateway", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.AI_GATEWAY_TOURNAMENT_ANALYTICS_MODEL = "openai/gpt-5.6-luna";
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { model: string };
        expect(body.model).toBe("openai/gpt-5.6-luna");
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              headline: "Alpha controls the first-contact battle",
              summary:
                "Alpha leads the measured field without overclaiming the partial sample.",
              findings: [
                {
                  metric: "aces",
                  title: "Service pressure",
                  explanation: "Alpha leads aces per set.",
                },
                {
                  metric: "digs",
                  title: "Floor defense",
                  explanation: "Bravo leads recorded digs per set.",
                },
              ],
            }),
          }),
          { status: 200 },
        );
      },
    );
    const result = await generateTournamentInsights({
      eventName: "Elite16 Test",
      sourceUrl: "https://en.volleyballworld.com/test",
      signature: "a".repeat(64),
      statistics: {
        coverage: {
          matchesWithStatistics: 4,
          totalMatches: 8,
          setsWithStatistics: 8,
        },
        averages: {
          hittingEfficiency: 31,
          acesPerSet: 1,
          blocksPerSet: 1,
          digsPerSet: 3,
        },
        teams: [],
        players: [],
        standouts: [],
        correlations: {},
      },
      fetchImpl: fetchImpl as typeof fetch,
      now: new Date("2026-08-06T12:00:00Z"),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ai-gateway.vercel.sh/v1/responses",
      expect.any(Object),
    );
    expect(result).toMatchObject({
      model: "openai/gpt-5.6-luna",
      signature: "a".repeat(64),
    });
  });
});
