import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inferPlayingExperienceNarrative,
  synthesizePlayingExperienceNarrative,
} from "./profile-onboarding";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("inferPlayingExperienceNarrative", () => {
  it("extracts a structured collegiate indoor history without inventing fields", () => {
    expect(
      inferPlayingExperienceNarrative(
        "I played indoor in college and have played beach for six years. I am 5 ft 10 in.",
      ),
    ).toMatchObject({
      playingExperience: "collegiate",
      playedIndoorPrior: true,
      yearsPlaying: 6,
      heightMillimeters: 1_778,
      confidence: "high",
    });
  });

  it("respects explicit negative indoor experience", () => {
    expect(
      inferPlayingExperienceNarrative(
        "Recreational beach player for 3 years. I have never played indoor.",
      ),
    ).toMatchObject({
      playingExperience: "amateur",
      playedIndoorPrior: false,
      yearsPlaying: 3,
      confidence: "high",
    });
  });

  it("extracts the college name for a collegiate player", () => {
    expect(
      inferPlayingExperienceNarrative(
        "I played collegiate indoor at Duke University for four years.",
      ),
    ).toMatchObject({
      playingExperience: "collegiate",
      playedIndoorPrior: true,
      yearsPlaying: 4,
      collegeName: "Duke University",
    });
  });

  it("leaves unknown answers undefined for human review", () => {
    const inferred = inferPlayingExperienceNarrative(
      "I like playing on weekends with friends.",
    );
    expect(inferred.playingExperience).toBeUndefined();
    expect(inferred.yearsPlaying).toBeUndefined();
    expect(inferred.heightMillimeters).toBeUndefined();
    expect(inferred.confidence).toBe("low");
  });

  it("routes OpenAI profile synthesis through Vercel AI Gateway", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("AI_GATEWAY_PROFILE_MODEL", "openai/test-profile-model");
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            playingExperience: "collegiate",
            playedIndoorPrior: true,
            yearsPlaying: 4,
            heightMillimeters: null,
            collegeName: "Duke University",
            summary: "Four years of collegiate indoor experience.",
            learnedFacts: ["Played indoor at Duke University"],
            missingFields: ["heightMillimeters"],
            confidence: "high",
          }),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizePlayingExperienceNarrative(
      "I played indoor at Duke University for four years.",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/responses");
    expect(request?.headers).toMatchObject({
      authorization: "Bearer gateway-key",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: "openai/test-profile-model",
      store: false,
    });
    expect(result).toMatchObject({
      playingExperience: "collegiate",
      collegeName: "Duke University",
      modelUsed: "openai",
    });
  });
});
