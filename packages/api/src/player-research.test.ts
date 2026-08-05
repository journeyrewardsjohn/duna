import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayerResearchProposal } from "./player-research";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("player research evidence workflow", () => {
  it("routes synthesis through Vercel AI Gateway and keeps every public claim evidence-bound", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "firecrawl-test");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test");
    const officialUrl = "https://example.org/players/alex-rivera";
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes("firecrawl.dev")) {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer firecrawl-test",
        });
        return new Response(
          JSON.stringify({
            data: {
              web: [
                {
                  title: "Alex Rivera official profile",
                  url: officialUrl,
                  description: "Official athlete profile and biography.",
                  markdown: "Alex Rivera represents the United States.",
                },
                {
                  title: "Alex Rivera : Career",
                  url: "http://www.bvbinfo.com/player.asp?ID=13454",
                  description: "Alex Rivera career results and match history.",
                },
                {
                  title: "Alex Rivera | Volleyball Life",
                  url: "https://volleyballlife.com/player/14063",
                  description: "Alex Rivera event history.",
                },
                {
                  title: "Legacy rating profile",
                  url: "https://sandrating.com/profile/649",
                  description: "This source must never reach synthesis.",
                },
              ],
            },
          }),
        );
      }
      expect(String(url)).toBe("https://ai-gateway.vercel.sh/v1/responses");
      const request = JSON.parse(String(init?.body)) as {
        model: string;
        input: readonly { content: readonly { text: string }[] }[];
        text: { format: { type: string; strict: boolean } };
      };
      expect(request.model).toBe("openai/gpt-5.6-luna");
      expect(request.text.format).toMatchObject({
        type: "json_schema",
        strict: true,
      });
      expect(request.input[1]?.content[0]?.text).toContain(officialUrl);
      expect(request.input[1]?.content[0]?.text).not.toContain(
        "sandrating.com",
      );
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            claims: [
              {
                field: "shortBio",
                value:
                  "Alex Rivera is a United States beach-volleyball player.",
                numericValue: null,
                confidence: 94,
                evidenceUrls: [officialUrl],
              },
              {
                field: "countryCode",
                value: "US",
                numericValue: null,
                confidence: 99,
                evidenceUrls: [officialUrl],
              },
              {
                field: "events",
                value: "18",
                numericValue: 18,
                confidence: 90,
                evidenceUrls: [officialUrl],
              },
              {
                field: "collegeName",
                value: "Coastal University",
                numericValue: null,
                confidence: 70,
                evidenceUrls: ["https://unsupported.example/college"],
              },
            ],
            news: [],
          }),
        }),
      );
    });

    const proposal = await createPlayerResearchProposal(
      {
        displayName: "Alex Rivera",
        countryCode: "US",
        worldRank: 12,
        genderCategory: "women",
      },
      {
        fetchImpl: fetchMock,
        now: new Date("2026-08-05T12:00:00.000Z"),
      },
    );

    expect(proposal).toMatchObject({
      status: "review",
      shortBio: "Alex Rivera is a United States beach-volleyball player.",
      countryCode: "US",
      careerStats: { events: 18 },
      sourceProfiles: [
        {
          source: "bvbinfo",
          externalId: "13454",
          url: "http://www.bvbinfo.com/player.asp?ID=13454",
          confidence: 98,
        },
        {
          source: "volleyball-life",
          externalId: "14063",
          url: "https://volleyballlife.com/player/14063",
          confidence: 98,
        },
      ],
    });
    expect(proposal.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: officialUrl })]),
    );
    expect(proposal.collegeName).toBeUndefined();
    expect(proposal.claims).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to bypass Vercel AI Gateway when credentials are absent", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "firecrawl-test");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");

    await expect(
      createPlayerResearchProposal({ displayName: "Alex Rivera" }),
    ).rejects.toThrow("Vercel AI Gateway is not configured");
  });

  it("explains the Vercel customer verification block without changing providers", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "firecrawl-test");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test");
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("firecrawl.dev")) {
        return new Response(
          JSON.stringify({
            data: {
              web: [
                {
                  title: "Alex Rivera official profile",
                  url: "https://example.org/players/alex-rivera",
                },
              ],
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          error: {
            code: "customer_verification_required",
            message: "Customer verification is required.",
          },
        }),
        { status: 403 },
      );
    });

    await expect(
      createPlayerResearchProposal(
        { displayName: "Alex Rivera" },
        { fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(
      "Vercel AI Gateway is blocking Duna research until the Vercel team completes customer verification or billing setup",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
