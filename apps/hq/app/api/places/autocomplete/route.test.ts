import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("HQ place autocomplete", () => {
  it("searches internationally without a country allowlist", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "ChIJVivoBeachClubPuertoRico",
                text: { text: "Vivo Beach Club, Carolina, Puerto Rico" },
                structuredFormat: {
                  mainText: { text: "Vivo Beach Club" },
                  secondaryText: { text: "Carolina, Puerto Rico" },
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://hq.duna.coach/api/places/autocomplete?q=Vivo%20Beach%20Club%20Puerto%20Rico",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      suggestions: [
        {
          mainText: "Vivo Beach Club",
          secondaryText: "Carolina, Puerto Rico",
        },
      ],
    });
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
      ),
    ).toEqual({ input: "Vivo Beach Club Puerto Rico" });
  });
});
