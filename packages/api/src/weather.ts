import type { MatchWeatherSnapshot } from "@duna/core";
import type {
  WeatherForecast,
  WeatherForecastDay,
  WeatherForecastPoint,
} from "./contracts";

const TOMORROW_TIMELINES_URL = "https://api.tomorrow.io/v4/timelines";
const TOMORROW_FORECAST_URL = "https://api.tomorrow.io/v4/weather/forecast";
const TOMORROW_REALTIME_URL = "https://api.tomorrow.io/v4/weather/realtime";
const TOMORROW_RECENT_HISTORY_URL =
  "https://api.tomorrow.io/v4/weather/history/recent";
const TOMORROW_HISTORICAL_URL = "https://api.tomorrow.io/v4/historical";
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const FORECAST_CACHE_MS = 30 * 60_000;
const TOMORROW_STANDARD_FORECAST_HORIZON_MS = 5 * 24 * 60 * 60_000;
export const WEATHER_FORECAST_HORIZON_MS = 14 * 24 * 60 * 60_000;
const LOCATION_CACHE_MS = 7 * 24 * 60 * 60_000;
const LOCATION_MISS_CACHE_MS = 30 * 60_000;
const MATCH_REALTIME_WINDOW_MS = 5 * 60_000;
const MATCH_RECENT_HISTORY_WINDOW_MS = 24 * 60 * 60_000;
const MATCH_TIMELINE_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const MATCH_WEATHER_FUTURE_TOLERANCE_MS = 10 * 60_000;

type CacheEntry = {
  readonly expiresAt: number;
  readonly value: WeatherForecast;
};

const forecastCache = new Map<string, CacheEntry>();

export type ResolvedWeatherCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
  readonly googlePlaceId?: string;
};

export function weatherForecastAvailableAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - WEATHER_FORECAST_HORIZON_MS);
}

export function weatherForecastIsAvailable(
  startsAt: Date,
  now: Date = new Date(),
): boolean {
  return startsAt.getTime() <= now.getTime() + WEATHER_FORECAST_HORIZON_MS;
}

type LocationCacheEntry = {
  readonly expiresAt: number;
  readonly value?: ResolvedWeatherCoordinates;
};

const locationCache = new Map<string, LocationCacheEntry>();

type TimelineInterval = {
  readonly time?: unknown;
  readonly startTime?: unknown;
  readonly values?: Readonly<Record<string, unknown>>;
};

type TomorrowTimelineResponse = {
  readonly data?: {
    readonly timelines?: readonly {
      readonly timestep?: unknown;
      readonly intervals?: readonly TimelineInterval[];
    }[];
  };
};

type TomorrowForecastResponse = {
  readonly timelines?: {
    readonly hourly?: readonly TimelineInterval[];
    readonly daily?: readonly TimelineInterval[];
  };
};

type TomorrowRealtimeResponse = {
  readonly data?: TimelineInterval;
};

type GoogleAutocompleteResponse = {
  readonly suggestions?: readonly {
    readonly placePrediction?: {
      readonly placeId?: unknown;
    };
  }[];
};

type GooglePlaceDetails = {
  readonly id?: unknown;
  readonly location?: {
    readonly latitude?: unknown;
    readonly longitude?: unknown;
  };
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function metricWindKph(value: unknown): number | undefined {
  const metersPerSecond = finiteNumber(value);
  return metersPerSecond === undefined
    ? undefined
    : Math.round(metersPerSecond * 36) / 10;
}

function normalizedLocationQuery(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").slice(0, 180) ?? "";
}

function validPlaceId(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && /^[A-Za-z0-9_-]{8,256}$/.test(candidate)
    ? candidate
    : undefined;
}

async function fetchGooglePlaceCoordinates(input: {
  readonly apiKey: string;
  readonly placeId: string;
  readonly signal: AbortSignal;
}): Promise<ResolvedWeatherCoordinates | undefined> {
  const response = await fetch(
    `${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(input.placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": "id,location",
      },
      signal: input.signal,
    },
  );
  if (!response.ok) return undefined;
  const place = (await response.json()) as GooglePlaceDetails;
  const latitude = finiteNumber(place.location?.latitude);
  const longitude = finiteNumber(place.location?.longitude);
  if (latitude === undefined || longitude === undefined) return undefined;
  return {
    latitude,
    longitude,
    googlePlaceId: typeof place.id === "string" ? place.id : input.placeId,
  };
}

/**
 * Older Duna records can predate mandatory Places coordinates. Resolve them
 * lazily so weather and daylight planning still work while new writes continue
 * to store the Place ID and coordinates directly.
 */
export async function resolveWeatherCoordinates(input: {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly googlePlaceId?: string;
  readonly query?: string;
  readonly now?: Date;
}): Promise<ResolvedWeatherCoordinates | undefined> {
  if (
    input.latitude !== undefined &&
    input.longitude !== undefined &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      googlePlaceId: validPlaceId(input.googlePlaceId),
    };
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return undefined;
  const now = input.now ?? new Date();
  const suppliedPlaceId = validPlaceId(input.googlePlaceId);
  const query = normalizedLocationQuery(input.query);
  const cacheKey = suppliedPlaceId
    ? `place:${suppliedPlaceId}`
    : query.length >= 3
      ? `query:${query.toLocaleLowerCase("en-US")}`
      : undefined;
  if (!cacheKey) return undefined;
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  let resolved: ResolvedWeatherCoordinates | undefined;
  try {
    let placeId = suppliedPlaceId;
    if (!placeId) {
      const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "suggestions.placePrediction.placeId",
        },
        body: JSON.stringify({
          input: query,
        }),
        signal: controller.signal,
      });
      if (response.ok) {
        const payload = (await response.json()) as GoogleAutocompleteResponse;
        const candidate = payload.suggestions?.[0]?.placePrediction?.placeId;
        placeId =
          typeof candidate === "string" ? validPlaceId(candidate) : undefined;
      }
    }
    if (placeId) {
      resolved = await fetchGooglePlaceCoordinates({
        apiKey,
        placeId,
        signal: controller.signal,
      });
    }
  } catch {
    // A missing geocode must never prevent an event or calendar from loading.
  } finally {
    clearTimeout(timeout);
  }
  locationCache.set(cacheKey, {
    value: resolved,
    expiresAt:
      now.getTime() + (resolved ? LOCATION_CACHE_MS : LOCATION_MISS_CACHE_MS),
  });
  if (locationCache.size > 250) {
    for (const [key, entry] of locationCache) {
      if (entry.expiresAt <= now.getTime()) locationCache.delete(key);
    }
  }
  return resolved;
}

function isoString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function dayOfYear(date: string): number {
  const start = Date.UTC(Number(date.slice(0, 4)), 0, 0);
  const current = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return Math.floor((current - start) / 86_400_000);
}

/**
 * NOAA's compact sunrise/sunset approximation. Tomorrow.io remains the
 * authoritative source inside its forecast horizon; this keeps a 90-day court
 * booking window safe when the weather provider cannot forecast that far out.
 */
function calculatedSunTime(input: {
  readonly date: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly sunrise: boolean;
}): string | undefined {
  const radians = Math.PI / 180;
  const degrees = 180 / Math.PI;
  const longitudeHour = input.longitude / 15;
  const approximate =
    dayOfYear(input.date) + ((input.sunrise ? 6 : 18) - longitudeHour) / 24;
  const meanAnomaly = 0.9856 * approximate - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly +
      1.916 * Math.sin(meanAnomaly * radians) +
      0.02 * Math.sin(2 * meanAnomaly * radians) +
      282.634,
  );
  let rightAscension =
    normalizeDegrees(
      Math.atan(0.91764 * Math.tan(trueLongitude * radians)) * degrees,
    ) / 15;
  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const rightAscensionQuadrant = Math.floor((rightAscension * 15) / 90) * 90;
  rightAscension += (longitudeQuadrant - rightAscensionQuadrant) / 15;
  const sinDeclination = 0.39782 * Math.sin(trueLongitude * radians);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHour =
    (Math.cos(90.833 * radians) -
      sinDeclination * Math.sin(input.latitude * radians)) /
    (cosDeclination * Math.cos(input.latitude * radians));
  if (cosHour > 1 || cosHour < -1) return undefined;
  const hourAngle =
    (input.sunrise
      ? 360 - Math.acos(cosHour) * degrees
      : Math.acos(cosHour) * degrees) / 15;
  const localMeanTime =
    hourAngle + rightAscension - 0.06571 * approximate - 6.622;
  const utcHour = (((localMeanTime - longitudeHour) % 24) + 24) % 24;
  const midnight = Date.parse(`${input.date}T00:00:00.000Z`);
  const candidate = midnight + utcHour * 60 * 60_000;
  const matchingLocalDay = [-1, 0, 1]
    .map((dayOffset) => new Date(candidate + dayOffset * 86_400_000))
    .find((instant) => localDate(instant, input.timezone) === input.date);
  return matchingLocalDay?.toISOString();
}

function localDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function datesBetween(
  startsAt: Date,
  endsAt: Date,
  timezone: string,
): readonly string[] {
  const first = localDate(startsAt, timezone);
  const last = localDate(endsAt, timezone);
  const dates: string[] = [];
  let cursor = new Date(`${first}T12:00:00.000Z`);
  const limit = new Date(`${last}T12:00:00.000Z`);
  while (cursor <= limit && dates.length < 32) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

export function weatherPresentation(code: number | undefined): {
  readonly condition: string;
  readonly icon: WeatherForecastPoint["icon"];
} {
  switch (code) {
    case 1000:
      return { condition: "Clear", icon: "clear" };
    case 1100:
      return { condition: "Mostly clear", icon: "mostly-clear" };
    case 1101:
      return { condition: "Partly cloudy", icon: "partly-cloudy" };
    case 1102:
      return { condition: "Mostly cloudy", icon: "partly-cloudy" };
    case 1001:
      return { condition: "Cloudy", icon: "cloudy" };
    case 2000:
    case 2100:
      return { condition: "Fog", icon: "fog" };
    case 4000:
    case 6000:
      return { condition: "Drizzle", icon: "drizzle" };
    case 4001:
    case 4200:
    case 4201:
    case 6001:
    case 6200:
    case 6201:
      return { condition: "Rain", icon: "rain" };
    case 5000:
    case 5001:
    case 5100:
    case 5101:
    case 7000:
    case 7101:
    case 7102:
      return { condition: "Snow or ice", icon: "snow" };
    case 8000:
      return { condition: "Thunderstorms", icon: "storm" };
    default:
      return { condition: "Forecast pending", icon: "unknown" };
  }
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const number = finiteNumber(value);
  return number === undefined
    ? undefined
    : Math.min(maximum, Math.max(minimum, number));
}

function nonnegativeNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : Math.max(0, number);
}

function matchWeatherCondition(
  values: Readonly<Record<string, unknown>>,
): string {
  const weatherCode = finiteNumber(values.weatherCode);
  if (weatherCode !== undefined) {
    return weatherPresentation(weatherCode).condition;
  }
  const rainIntensity =
    nonnegativeNumber(values.rainIntensity) ??
    nonnegativeNumber(values.precipitationIntensity);
  const precipitationAccumulation = nonnegativeNumber(
    values.precipitationAccumulation,
  );
  if (
    (rainIntensity !== undefined && rainIntensity > 0) ||
    (precipitationAccumulation !== undefined && precipitationAccumulation > 0)
  ) {
    return "Rain";
  }
  const cloudCover = boundedNumber(values.cloudCover, 0, 100);
  if (cloudCover === undefined) return "Conditions recorded";
  if (cloudCover <= 15) return "Clear";
  if (cloudCover <= 40) return "Mostly clear";
  if (cloudCover <= 70) return "Partly cloudy";
  if (cloudCover <= 90) return "Mostly cloudy";
  return "Cloudy";
}

function nearestInterval(
  intervals: readonly TimelineInterval[],
  instant: Date,
): TimelineInterval | undefined {
  return intervals
    .flatMap((interval) => {
      const observedAt =
        isoString(interval.time) ?? isoString(interval.startTime);
      return observedAt ? [{ interval, observedAt }] : [];
    })
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.observedAt) - instant.getTime()) -
        Math.abs(Date.parse(right.observedAt) - instant.getTime()),
    )[0]?.interval;
}

function normalizeMatchWeatherSnapshot(input: {
  readonly interval: TimelineInterval | undefined;
  readonly latitude: number;
  readonly longitude: number;
  readonly matchTime: Date;
  readonly source: MatchWeatherSnapshot["source"];
}): MatchWeatherSnapshot | undefined {
  if (!input.interval) return undefined;
  const observedAt =
    isoString(input.interval.time) ?? isoString(input.interval.startTime);
  if (!observedAt) return undefined;
  const values = input.interval.values ?? {};
  const weatherCode = finiteNumber(values.weatherCode);
  const temperatureC = finiteNumber(values.temperature);
  const apparentTemperatureC = finiteNumber(values.temperatureApparent);
  const humidityPercent = boundedNumber(values.humidity, 0, 100);
  const precipitationProbabilityPercent = boundedNumber(
    values.precipitationProbability,
    0,
    100,
  );
  const precipitationIntensityMmPerHour = nonnegativeNumber(
    values.precipitationIntensity,
  );
  const precipitationAccumulationMm = nonnegativeNumber(
    values.precipitationAccumulation,
  );
  const rainIntensityMmPerHour = nonnegativeNumber(values.rainIntensity);
  const cloudCoverPercent = boundedNumber(values.cloudCover, 0, 100);
  const windSpeedKph = metricWindKph(values.windSpeed);
  const windGustKph = metricWindKph(values.windGust);
  const windDirection = finiteNumber(values.windDirection);
  const windDirectionDegrees =
    windDirection === undefined ? undefined : normalizeDegrees(windDirection);
  const uvIndex = nonnegativeNumber(values.uvIndex);
  if (
    [
      weatherCode,
      temperatureC,
      apparentTemperatureC,
      humidityPercent,
      precipitationProbabilityPercent,
      precipitationIntensityMmPerHour,
      precipitationAccumulationMm,
      rainIntensityMmPerHour,
      cloudCoverPercent,
      windSpeedKph,
      windGustKph,
      windDirectionDegrees,
      uvIndex,
    ].every((value) => value === undefined)
  ) {
    return undefined;
  }
  return {
    provider: "Tomorrow.io",
    source: input.source,
    matchTime: input.matchTime.toISOString(),
    observedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    condition: matchWeatherCondition(values),
    weatherCode,
    temperatureC,
    apparentTemperatureC,
    humidityPercent,
    precipitationProbabilityPercent,
    precipitationIntensityMmPerHour,
    precipitationAccumulationMm,
    rainIntensityMmPerHour,
    cloudCoverPercent,
    windSpeedKph,
    windGustKph,
    windDirectionDegrees,
    uvIndex,
  };
}

/**
 * Captures one immutable weather observation for a stored match. Requests are
 * deliberately split by provider data window so an old match never receives
 * today's realtime conditions or a future forecast presented as history.
 */
export async function captureMatchWeatherSnapshot(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly matchTime: Date;
  readonly now?: Date;
}): Promise<MatchWeatherSnapshot | undefined> {
  const apiKey = process.env.TOMORROW_IO_API_KEY?.trim();
  if (!apiKey) return undefined;
  const now = input.now ?? new Date();
  const age = now.getTime() - input.matchTime.getTime();
  if (age < -MATCH_WEATHER_FUTURE_TOLERANCE_MS) return undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    if (age <= MATCH_REALTIME_WINDOW_MS) {
      const url = new URL(TOMORROW_REALTIME_URL);
      url.searchParams.set("location", `${input.latitude},${input.longitude}`);
      url.searchParams.set("units", "metric");
      url.searchParams.set("apikey", apiKey);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return undefined;
      const payload = (await response.json()) as TomorrowRealtimeResponse;
      return normalizeMatchWeatherSnapshot({
        interval: payload.data,
        latitude: input.latitude,
        longitude: input.longitude,
        matchTime: input.matchTime,
        source: "realtime",
      });
    }

    if (age <= MATCH_RECENT_HISTORY_WINDOW_MS) {
      const url = new URL(TOMORROW_RECENT_HISTORY_URL);
      url.searchParams.set("location", `${input.latitude},${input.longitude}`);
      url.searchParams.set("timesteps", "1h");
      url.searchParams.set("units", "metric");
      url.searchParams.set("apikey", apiKey);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return undefined;
      const payload = (await response.json()) as TomorrowForecastResponse;
      return normalizeMatchWeatherSnapshot({
        interval: nearestInterval(
          payload.timelines?.hourly ?? [],
          input.matchTime,
        ),
        latitude: input.latitude,
        longitude: input.longitude,
        matchTime: input.matchTime,
        source: "recent-history",
      });
    }

    const startTime = new Date(input.matchTime.getTime() - 30 * 60_000);
    const endTime = new Date(input.matchTime.getTime() + 30 * 60_000);
    const historical = age > MATCH_TIMELINE_HISTORY_WINDOW_MS;
    const response = await fetch(
      historical
        ? `${TOMORROW_HISTORICAL_URL}?apikey=${encodeURIComponent(apiKey)}`
        : `${TOMORROW_TIMELINES_URL}?apikey=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location: [input.latitude, input.longitude],
          fields: historical
            ? [
                "temperature",
                "humidity",
                "windSpeed",
                "windDirection",
                "windGust",
                "precipitationAccumulation",
                "cloudCover",
              ]
            : [
                "temperature",
                "temperatureApparent",
                "humidity",
                "precipitationProbability",
                "precipitationIntensity",
                "precipitationAccumulation",
                "rainIntensity",
                "cloudCover",
                "windSpeed",
                "windGust",
                "windDirection",
                "uvIndex",
                "weatherCode",
              ],
          timesteps: ["1h"],
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          units: "metric",
          timezone: "UTC",
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return undefined;
    const payload = (await response.json()) as TomorrowTimelineResponse;
    const intervals =
      payload.data?.timelines?.find((timeline) => timeline.timestep === "1h")
        ?.intervals ?? [];
    return normalizeMatchWeatherSnapshot({
      interval: nearestInterval(intervals, input.matchTime),
      latitude: input.latitude,
      longitude: input.longitude,
      matchTime: input.matchTime,
      source: historical ? "historical-reanalysis" : "timeline-history",
    });
  } catch {
    // Weather enrichment is best effort and must never block recording a match.
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackDays(input: {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
}): WeatherForecastDay[] {
  return datesBetween(input.startsAt, input.endsAt, input.timezone).map(
    (date) => ({
      date,
      condition: "Forecast pending",
      icon: "unknown",
      sunriseAt: calculatedSunTime({
        date,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
        sunrise: true,
      }),
      sunsetAt: calculatedSunTime({
        date,
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: input.timezone,
        sunrise: false,
      }),
      daylightSource: "calculated",
    }),
  );
}

function hourlyPoint(
  interval: TimelineInterval,
): WeatherForecastPoint | undefined {
  const startsAt = isoString(interval.time) ?? isoString(interval.startTime);
  if (!startsAt) return undefined;
  const values = interval.values ?? {};
  const weatherCode = finiteNumber(values.weatherCode);
  return {
    startsAt,
    temperatureC: finiteNumber(values.temperature),
    apparentTemperatureC: finiteNumber(values.temperatureApparent),
    precipitationProbability: finiteNumber(values.precipitationProbability),
    precipitationIntensity: finiteNumber(values.precipitationIntensity),
    windSpeedKph: metricWindKph(values.windSpeed),
    windGustKph: metricWindKph(values.windGust),
    humidity: finiteNumber(values.humidity),
    weatherCode,
    ...weatherPresentation(weatherCode),
  };
}

function dailyPoint(
  interval: TimelineInterval,
  timezone: string,
): WeatherForecastDay | undefined {
  const startsAt = isoString(interval.time) ?? isoString(interval.startTime);
  if (!startsAt) return undefined;
  const values = interval.values ?? {};
  const weatherCode =
    finiteNumber(values.weatherCodeMax) ??
    finiteNumber(values.weatherCodeFullDay) ??
    finiteNumber(values.weatherCode);
  return {
    date: localDate(new Date(startsAt), timezone),
    temperatureHighC:
      finiteNumber(values.temperatureMax) ?? finiteNumber(values.temperature),
    temperatureLowC:
      finiteNumber(values.temperatureMin) ??
      finiteNumber(values.temperatureAvg),
    precipitationProbability:
      finiteNumber(values.precipitationProbabilityMax) ??
      finiteNumber(values.precipitationProbabilityAvg) ??
      finiteNumber(values.precipitationProbability),
    windGustKph:
      metricWindKph(values.windGustMax) ??
      metricWindKph(values.windGustAvg) ??
      metricWindKph(values.windGust),
    weatherCode,
    ...weatherPresentation(weatherCode),
    sunriseAt: isoString(values.sunriseTime),
    sunsetAt: isoString(values.sunsetTime),
    daylightSource:
      isoString(values.sunriseTime) || isoString(values.sunsetTime)
        ? "tomorrow.io"
        : "calculated",
  };
}

function mergeDays(
  fallback: readonly WeatherForecastDay[],
  provider: readonly WeatherForecastDay[],
): readonly WeatherForecastDay[] {
  const providerByDate = new Map(provider.map((day) => [day.date, day]));
  return fallback.map((day) => {
    const forecast = providerByDate.get(day.date);
    if (!forecast) return day;
    return {
      ...day,
      ...forecast,
      sunriseAt: forecast.sunriseAt ?? day.sunriseAt,
      sunsetAt: forecast.sunsetAt ?? day.sunsetAt,
      daylightSource:
        forecast.sunriseAt && forecast.sunsetAt
          ? "tomorrow.io"
          : day.daylightSource,
    };
  });
}

function forecastKey(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}): string {
  return [
    input.latitude.toFixed(4),
    input.longitude.toFixed(4),
    input.timezone,
    localDate(input.startsAt, input.timezone),
    localDate(input.endsAt, input.timezone),
  ].join(":");
}

function standardForecastIsRelevant(input: {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly now: Date;
}): boolean {
  return (
    input.startsAt.getTime() <=
      input.now.getTime() + TOMORROW_STANDARD_FORECAST_HORIZON_MS &&
    input.endsAt.getTime() >= input.now.getTime() - 24 * 60 * 60_000
  );
}

function filterHourlyForecast(
  intervals: readonly TimelineInterval[],
  startsAt: Date,
  endsAt: Date,
): readonly WeatherForecastPoint[] {
  const earliest = startsAt.getTime() - 60 * 60_000;
  const latest = endsAt.getTime() + 60 * 60_000;
  return intervals.flatMap((interval) => {
    const point = hourlyPoint(interval);
    if (!point) return [];
    const timestamp = Date.parse(point.startsAt);
    return timestamp >= earliest && timestamp <= latest ? [point] : [];
  });
}

function filterDailyForecast(
  intervals: readonly TimelineInterval[],
  startsAt: Date,
  endsAt: Date,
  timezone: string,
): readonly WeatherForecastDay[] {
  const requestedDates = new Set(datesBetween(startsAt, endsAt, timezone));
  return intervals.flatMap((interval) => {
    const point = dailyPoint(interval, timezone);
    return point && requestedDates.has(point.date) ? [point] : [];
  });
}

export async function loadWeatherForecast(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly now?: Date;
}): Promise<WeatherForecast> {
  const now = input.now ?? new Date();
  const key = forecastKey(input);
  const cached = forecastCache.get(key);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;
  const fetchedAt = now.toISOString();
  const fallback = fallbackDays(input);
  let hourly: readonly WeatherForecastPoint[] = [];
  let providerDays: readonly WeatherForecastDay[] = [];
  let source: WeatherForecast["source"] = "calculated-daylight";
  const apiKey = process.env.TOMORROW_IO_API_KEY?.trim();
  const requestIntersectsForecastHorizon =
    input.startsAt.getTime() <= now.getTime() + WEATHER_FORECAST_HORIZON_MS &&
    input.endsAt.getTime() >= now.getTime() - 24 * 60 * 60_000;
  if (apiKey && requestIntersectsForecastHorizon) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      if (
        standardForecastIsRelevant({
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          now,
        })
      ) {
        const url = new URL(TOMORROW_FORECAST_URL);
        url.searchParams.set(
          "location",
          `${input.latitude},${input.longitude}`,
        );
        url.searchParams.set("units", "metric");
        url.searchParams.set("apikey", apiKey);
        const response = await fetch(url, { signal: controller.signal });
        if (response.ok) {
          const payload = (await response.json()) as TomorrowForecastResponse;
          hourly = filterHourlyForecast(
            payload.timelines?.hourly ?? [],
            input.startsAt,
            input.endsAt,
          );
          providerDays = filterDailyForecast(
            payload.timelines?.daily ?? [],
            input.startsAt,
            input.endsAt,
            input.timezone,
          );
        }
      }
      if (hourly.length === 0 && providerDays.length === 0) {
        const response = await fetch(
          `${TOMORROW_TIMELINES_URL}?apikey=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              location: [input.latitude, input.longitude],
              fields: [
                "temperature",
                "temperatureApparent",
                "temperatureMax",
                "temperatureMin",
                "weatherCode",
                "weatherCodeMax",
                "precipitationProbability",
                "precipitationProbabilityMax",
                "precipitationIntensity",
                "windSpeed",
                "windGust",
                "windGustMax",
                "humidity",
                "sunriseTime",
                "sunsetTime",
              ],
              units: "metric",
              timesteps: ["1h", "1d"],
              startTime: input.startsAt.toISOString(),
              endTime: input.endsAt.toISOString(),
              timezone: input.timezone,
            }),
            signal: controller.signal,
          },
        );
        if (response.ok) {
          const payload = (await response.json()) as TomorrowTimelineResponse;
          const timelines = payload.data?.timelines ?? [];
          hourly =
            timelines
              .find((timeline) => timeline.timestep === "1h")
              ?.intervals?.flatMap((interval) => {
                const point = hourlyPoint(interval);
                return point ? [point] : [];
              }) ?? [];
          providerDays =
            timelines
              .find((timeline) => timeline.timestep === "1d")
              ?.intervals?.flatMap((interval) => {
                const point = dailyPoint(interval, input.timezone);
                return point ? [point] : [];
              }) ?? [];
        }
      }
      if (hourly.length > 0 || providerDays.length > 0) {
        source = "tomorrow.io";
      }
    } catch {
      // Daylight calculations keep booking safe while provider errors remain
      // non-blocking. Surfaces clearly label the calculated-only state.
    } finally {
      clearTimeout(timeout);
    }
  }
  const value: WeatherForecast = {
    provider: "Tomorrow.io",
    source,
    latitude: input.latitude,
    longitude: input.longitude,
    timezone: input.timezone,
    fetchedAt,
    updatedAt: fetchedAt,
    expiresAt: new Date(now.getTime() + FORECAST_CACHE_MS).toISOString(),
    hourly,
    days: mergeDays(fallback, providerDays),
  };
  forecastCache.set(key, {
    value,
    expiresAt: now.getTime() + FORECAST_CACHE_MS,
  });
  if (forecastCache.size > 250) {
    for (const [cacheKey, entry] of forecastCache) {
      if (entry.expiresAt <= now.getTime()) forecastCache.delete(cacheKey);
    }
  }
  return value;
}

export function weatherAt(
  forecast: WeatherForecast | undefined,
  instant: Date,
): WeatherForecastPoint | undefined {
  if (!forecast || forecast.hourly.length === 0) return undefined;
  return [...forecast.hourly].sort(
    (left, right) =>
      Math.abs(Date.parse(left.startsAt) - instant.getTime()) -
      Math.abs(Date.parse(right.startsAt) - instant.getTime()),
  )[0];
}

export function weatherDay(
  forecast: WeatherForecast | undefined,
  date: string,
): WeatherForecastDay | undefined {
  return forecast?.days.find((day) => day.date === date);
}

export type DaylightStatus =
  | "daylight"
  | "before-sunrise"
  | "crosses-sunrise"
  | "crosses-sunset"
  | "after-dark"
  | "unknown";

export function daylightStatus(
  startsAt: Date,
  endsAt: Date,
  day: WeatherForecastDay | undefined,
): DaylightStatus {
  if (!day?.sunriseAt || !day.sunsetAt) return "unknown";
  const sunrise = Date.parse(day.sunriseAt);
  const sunset = Date.parse(day.sunsetAt);
  if (endsAt.getTime() <= sunrise) return "before-sunrise";
  if (startsAt.getTime() < sunrise && endsAt.getTime() > sunrise) {
    return "crosses-sunrise";
  }
  if (startsAt.getTime() >= sunset) return "after-dark";
  if (startsAt.getTime() < sunset && endsAt.getTime() > sunset) {
    return "crosses-sunset";
  }
  return "daylight";
}

export function __resetWeatherCacheForTests(): void {
  forecastCache.clear();
  locationCache.clear();
}
