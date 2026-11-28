/**
 * Demo fixtures: conditions (owner: B11). A day at the demo club's pier
 * venue (28 Nov 2026, Los Angeles): hourly forecast with every wind
 * strength and alert level, sun times split into every light phase, courts
 * with every wind-relative state, plus the "provider not configured" answer.
 * Weather values are illustrative, not a real forecast.
 */
import { demoVenues } from "../demo";
import { demoId } from "./ids";

const pier = demoVenues[0]!;
const locationKey = `venue:${pier.id}`;
const hourIso = (utcHour: number) => {
  const day = 28 + Math.floor(utcHour / 24);
  return `2026-11-${String(day).padStart(2, "0")}T${String(utcHour % 24).padStart(2, "0")}:00:00.000Z`;
};

type Strength = "calm" | "light" | "steady" | "strong";
type Alert = "none" | "watch" | "stop";
const hour = (
  utcHour: number,
  temperatureC: number,
  windSpeedKph: number,
  windGustKph: number,
  windStrength: Strength,
  precipitationProbability: number,
  uvIndex: number,
  alertLevel: Alert = "none",
  lightningDistanceKm?: number,
) => ({
  hourStartsAt: hourIso(utcHour),
  temperatureC,
  feelsLikeC: temperatureC - 1,
  windSpeedKph,
  windGustKph,
  windDirectionDeg: 260,
  windStrength,
  precipitationProbability,
  uvIndex,
  ...(lightningDistanceKm === undefined ? {} : { lightningDistanceKm }),
  alertLevel,
  conditionCode: alertLevel === "stop" ? "thunderstorm" : "clear",
  provider: "tomorrow-io" as const,
});

export const conditionsDemoForecast = {
  locationKey,
  venueId: pier.id,
  timezone: pier.timezone,
  source: "cached" as const,
  fetchedAt: "2026-11-28T14:00:00.000Z",
  hours: [
    hour(15, 12, 3, 5, "calm", 0, 0),
    hour(17, 15, 8, 12, "light", 0, 2),
    hour(19, 18, 14, 22, "steady", 5, 4),
    hour(21, 19, 22, 35, "strong", 20, 4, "watch", 30),
    hour(22, 18, 24, 36, "strong", 60, 3, "stop", 13),
    hour(24, 15, 12, 18, "steady", 30, 0),
    hour(26, 13, 6, 9, "light", 0, 0),
  ],
  attribution: "Weather data: Tomorrow.io",
};

export const conditionsDemoNotConfigured = {
  locationKey,
  venueId: pier.id,
  timezone: pier.timezone,
  source: "provider-not-configured" as const,
  hours: [],
};

/** The same forecast fetched just now, and one past its expiry (shown dimmed with "updated …"). */
export const conditionsDemoForecastLive = {
  ...conditionsDemoForecast,
  source: "live" as const,
  fetchedAt: "2026-11-28T15:00:00.000Z",
};
export const conditionsDemoForecastStale = {
  ...conditionsDemoForecast,
  source: "stale" as const,
  fetchedAt: "2026-11-28T03:00:00.000Z",
};

export const conditionsDemoSun = {
  locationKey,
  localDate: "2026-11-28",
  timezone: pier.timezone,
  provider: "noaa" as const,
  civilDawnAt: "2026-11-28T14:11:00.000Z",
  sunriseAt: "2026-11-28T14:38:00.000Z",
  goldenHourStartsAt: "2026-11-28T23:45:00.000Z",
  sunsetAt: "2026-11-29T00:45:00.000Z",
  civilDuskAt: "2026-11-29T01:12:00.000Z",
  phases: [
    {
      phase: "first-light" as const,
      startsAt: "2026-11-28T14:11:00.000Z",
      endsAt: "2026-11-28T14:38:00.000Z",
    },
    {
      phase: "full-sun" as const,
      startsAt: "2026-11-28T14:38:00.000Z",
      endsAt: "2026-11-28T23:45:00.000Z",
    },
    {
      phase: "golden-hour" as const,
      startsAt: "2026-11-28T23:45:00.000Z",
      endsAt: "2026-11-29T00:45:00.000Z",
    },
    {
      phase: "under-lights" as const,
      startsAt: "2026-11-29T00:45:00.000Z",
      endsAt: "2026-11-29T06:00:00.000Z",
    },
    {
      phase: "too-dark" as const,
      startsAt: "2026-11-29T06:00:00.000Z",
      endsAt: "2026-11-29T14:11:00.000Z",
    },
  ],
};

/** A computed sun table for a point with no venue (public pages). */
export const conditionsDemoSunComputed = {
  ...conditionsDemoSun,
  locationKey: "geo:33.88,-118.41",
  provider: "computed" as const,
};

const court = (n: number) => demoId("conditions", 100 + n);
export const conditionsDemoCourts = [
  {
    courtId: court(1),
    courtName: "Court 1",
    orientationDeg: 90,
    lit: true,
    windRelative: "along-court" as const,
    windStrength: "steady" as const,
    note: "Gusts 22 mph · 2–4 PM",
  },
  {
    courtId: court(2),
    courtName: "Court 2",
    orientationDeg: 0,
    lit: true,
    windRelative: "across-court" as const,
    windStrength: "strong" as const,
    note: "Gusts 36 mph · 5–7 PM",
  },
  {
    courtId: court(3),
    courtName: "Court 3",
    orientationDeg: 135,
    lit: false,
    windRelative: "diagonal" as const,
    windStrength: "light" as const,
  },
  {
    courtId: court(4),
    courtName: "Court 4",
    orientationDeg: 90,
    lit: false,
    windRelative: "calm" as const,
    windStrength: "calm" as const,
  },
  {
    courtId: court(5),
    courtName: "Court 5",
    lit: false,
    windRelative: "orientation-unknown" as const,
  },
];

export const conditionsDemoVenueDay = {
  venueId: pier.id,
  date: "2026-11-28",
  forecast: conditionsDemoForecast,
  sun: conditionsDemoSun,
  courts: conditionsDemoCourts,
  alert: {
    level: "stop" as const,
    headline: "Lightning 8 mi away · play is paused",
    hourStartsAt: hourIso(22),
  },
};

export const conditionsDemo = {
  domain: "conditions",
  forecast: conditionsDemoForecast,
  forecastLive: conditionsDemoForecastLive,
  forecastStale: conditionsDemoForecastStale,
  notConfigured: conditionsDemoNotConfigured,
  sun: conditionsDemoSun,
  sunComputed: conditionsDemoSunComputed,
  courts: conditionsDemoCourts,
  venueDay: conditionsDemoVenueDay,
} as const;
