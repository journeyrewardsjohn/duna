import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as autocomplete } from "./autocomplete/route";
import { GET as details } from "./details/route";
import { PLACES_BUDGETS, ShortCache } from "./guard";

let client = 0;
/** A fresh visitor address per test, so budgets never leak between tests. */
function visitor() {
  client += 1;
  return { "x-forwarded-for": `192.0.2.${client}` };
}

function okSuggestions() {
  return new Response(
    JSON.stringify({
      suggestions: [
        {
          placePrediction: {
            placeId: "ChIJtest-place-0001",
            text: { text: "Test Beach, CA, USA" },
            structuredFormat: {
              mainText: { text: "Test Beach" },
              secondaryText: { text: "CA, USA" },
            },
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Places protection", () => {
  it("passes the picker's session token and region through to the provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okSuggestions());
    vi.stubGlobal("fetch", fetchMock);
    const response = await autocomplete(
      new Request(
        "https://duna.coach/api/places/autocomplete?q=session%20beach%201&session=3b0c1e2a-58f4-4b2a-9a77-3f6d2a1c9e10",
        { headers: { ...visitor(), "x-vercel-ip-country": "US" } },
      ),
    );
    expect(response.status).toBe(200);
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)),
    ).toEqual({
      input: "session beach 1",
      sessionToken: "3b0c1e2a-58f4-4b2a-9a77-3f6d2a1c9e10",
      regionCode: "us",
    });

    const detailsFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "ChIJtest-place-0001",
          displayName: { text: "Test Beach" },
          formattedAddress: "Test Beach, CA, USA",
          location: { latitude: 33.9, longitude: -118.4 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", detailsFetch);
    const place = await details(
      new Request(
        "https://duna.coach/api/places/details?placeId=ChIJtest-place-0001&session=3b0c1e2a-58f4-4b2a-9a77-3f6d2a1c9e10",
        { headers: visitor() },
      ),
    );
    expect(await place.json()).toMatchObject({ name: "Test Beach" });
    expect(String(detailsFetch.mock.calls[0]?.[0])).toContain(
      "sessionToken=3b0c1e2a-58f4-4b2a-9a77-3f6d2a1c9e10",
    );
  });

  it("answers identical searches from a short cache", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okSuggestions());
    vi.stubGlobal("fetch", fetchMock);
    const ask = () =>
      autocomplete(
        new Request(
          "https://duna.coach/api/places/autocomplete?q=Cached%20Beach%20Two",
          { headers: visitor() },
        ),
      );
    await ask();
    const second = await ask();
    expect(await second.json()).toMatchObject({
      suggestions: [{ mainText: "Test Beach" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says 429 with Retry-After once a visitor is over the typing budget", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okSuggestions());
    vi.stubGlobal("fetch", fetchMock);
    const headers = visitor();
    const statuses: number[] = [];
    for (
      let index = 0;
      index <= PLACES_BUDGETS.autocomplete.capacity;
      index += 1
    ) {
      const response = await autocomplete(
        new Request(
          `https://duna.coach/api/places/autocomplete?q=budget%20beach%20${index}`,
          { headers },
        ),
      );
      statuses.push(response.status);
      if (response.status === 429) {
        expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
        expect(await response.json()).toMatchObject({
          error: "Lots of searches just now. Try again in a few seconds.",
        });
      }
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(
      PLACES_BUDGETS.autocomplete.capacity,
    );
    expect(statuses.at(-1)).toBe(429);
    // Another visitor still searches.
    const other = await autocomplete(
      new Request(
        "https://duna.coach/api/places/autocomplete?q=other%20visitor%20beach",
        { headers: visitor() },
      ),
    );
    expect(other.status).toBe(200);
  });

  it("short text and a missing key never reach the provider or the budget", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const short = await autocomplete(
      new Request("https://duna.coach/api/places/autocomplete?q=ab", {
        headers: visitor(),
      }),
    );
    expect(await short.json()).toEqual({ suggestions: [] });
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const off = await autocomplete(
      new Request("https://duna.coach/api/places/autocomplete?q=anything", {
        headers: visitor(),
      }),
    );
    expect(off.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ShortCache", () => {
  it("expires entries and keeps at most its size, oldest out first", () => {
    const cache = new ShortCache<number>(1_000, 2);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    expect(cache.get("a", 10)).toBe(1);
    cache.set("c", 3, 10);
    expect(cache.get("b", 10)).toBeUndefined();
    expect(cache.get("a", 10)).toBe(1);
    expect(cache.get("c", 2_000)).toBeUndefined();
  });
});
