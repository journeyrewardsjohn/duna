import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetWeatherCacheForTests,
  daylightStatus,
  loadWeatherForecast,
  resolveWeatherCoordinates,
  weatherAt,
  weatherPresentation,
} from "./weather";

afterEach(() => {
  __resetWeatherCacheForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("weather and daylight planning", () => {
  it("keeps daylight constraints available when Tomorrow.io is unavailable", async () => {
    vi.stubEnv("TOMORROW_IO_API_KEY", "");
    const forecast = await loadWeatherForecast({
      latitude: 33.8847,
      longitude: -118.4109,
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-08-03T07:00:00.000Z"),
      endsAt: new Date("2026-08-05T07:00:00.000Z"),
      now: new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(forecast.source).toBe("calculated-daylight");
    expect(forecast.days).toHaveLength(3);
    expect(forecast.days[0]).toMatchObject({
      date: "2026-08-03",
      daylightSource: "calculated",
    });
    expect(forecast.days[0]?.sunriseAt).toMatch(/Z$/);
    expect(forecast.days[0]?.sunsetAt).toMatch(/Z$/);

    const day = forecast.days[0]!;
    const sunset = Date.parse(day.sunsetAt!);
    expect(
      daylightStatus(
        new Date(sunset - 60 * 60_000),
        new Date(sunset - 30 * 60_000),
        day,
      ),
    ).toBe("daylight");
    expect(
      daylightStatus(
        new Date(sunset - 30 * 60_000),
        new Date(sunset + 30 * 60_000),
        day,
      ),
    ).toBe("crosses-sunset");
    expect(
      daylightStatus(
        new Date(sunset + 30 * 60_000),
        new Date(sunset + 90 * 60_000),
        day,
      ),
    ).toBe("after-dark");
  });

  it("normalizes Tomorrow.io forecasts and caches identical forecasts", async () => {
    vi.stubEnv("TOMORROW_IO_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          timelines: {
            hourly: [
              {
                time: "2026-08-03T15:00:00.000Z",
                values: {
                  temperature: 24,
                  weatherCode: 1101,
                  precipitationProbability: 12,
                  windSpeed: 5,
                },
              },
            ],
            daily: [
              {
                time: "2026-08-03T07:00:00.000Z",
                values: {
                  temperatureMax: 27,
                  temperatureMin: 18,
                  weatherCodeMax: 1101,
                  precipitationProbabilityMax: 12,
                  sunriseTime: "2026-08-03T13:05:00.000Z",
                  sunsetTime: "2026-08-04T02:52:00.000Z",
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      latitude: 33.8847,
      longitude: -118.4109,
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-08-03T07:00:00.000Z"),
      endsAt: new Date("2026-08-04T06:59:59.000Z"),
      now: new Date("2026-08-02T12:00:00.000Z"),
    } as const;

    const first = await loadWeatherForecast(input);
    const second = await loadWeatherForecast(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://api.tomorrow.io/v4/weather/forecast",
    );
    expect(requestUrl.searchParams.get("location")).toBe("33.8847,-118.4109");
    expect(requestUrl.searchParams.get("units")).toBe("metric");
    expect(second).toEqual(first);
    expect(first.source).toBe("tomorrow.io");
    expect(first.days[0]).toMatchObject({
      date: "2026-08-03",
      condition: "Partly cloudy",
      icon: "partly-cloudy",
      daylightSource: "tomorrow.io",
    });
    expect(
      weatherAt(first, new Date("2026-08-03T15:12:00.000Z")),
    ).toMatchObject({
      temperatureC: 24,
      precipitationProbability: 12,
      windSpeedKph: 18,
    });
  });

  it("falls back to advanced timelines when the forecast endpoint is unavailable", async () => {
    vi.stubEnv("TOMORROW_IO_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              timelines: [
                {
                  timestep: "1h",
                  intervals: [
                    {
                      startTime: "2026-08-03T15:00:00.000Z",
                      values: {
                        temperature: 24,
                        weatherCode: 1101,
                        precipitationProbability: 12,
                      },
                    },
                  ],
                },
                {
                  timestep: "1d",
                  intervals: [
                    {
                      startTime: "2026-08-03T07:00:00.000Z",
                      values: {
                        temperatureMax: 27,
                        temperatureMin: 18,
                        weatherCodeMax: 1101,
                        precipitationProbabilityMax: 12,
                        sunriseTime: "2026-08-03T13:05:00.000Z",
                        sunsetTime: "2026-08-04T02:52:00.000Z",
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const forecast = await loadWeatherForecast({
      latitude: 33.8847,
      longitude: -118.4109,
      timezone: "America/Los_Angeles",
      startsAt: new Date("2026-08-03T07:00:00.000Z"),
      endsAt: new Date("2026-08-04T06:59:59.000Z"),
      now: new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body),
      ),
    ).toMatchObject({
      location: [33.8847, -118.4109],
      timesteps: ["1h", "1d"],
    });
    expect(forecast.source).toBe("tomorrow.io");
    expect(forecast.hourly).toHaveLength(1);
  });

  it("maps severe weather to planning-friendly presentation", () => {
    expect(weatherPresentation(8000)).toEqual({
      condition: "Thunderstorms",
      icon: "storm",
    });
    expect(weatherPresentation(4201)).toEqual({
      condition: "Rain",
      icon: "rain",
    });
  });

  it("resolves legacy venue text through Google Places and caches it", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "places-test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            suggestions: [
              {
                placePrediction: {
                  placeId: "ChIJHermosaPierCourts",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "ChIJHermosaPierCourts",
            location: {
              latitude: 33.8622,
              longitude: -118.3995,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveWeatherCoordinates({
      query: "Hermosa Beach Pier Courts",
      now: new Date("2026-08-02T12:00:00.000Z"),
    });
    const second = await resolveWeatherCoordinates({
      query: "Hermosa   Beach Pier Courts",
      now: new Date("2026-08-02T12:05:00.000Z"),
    });

    expect(first).toEqual({
      latitude: 33.8622,
      longitude: -118.3995,
      googlePlaceId: "ChIJHermosaPierCourts",
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
