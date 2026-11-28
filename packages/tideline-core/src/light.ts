/**
 * Daylight: sunrise, sunset, golden hour and civil twilight for a place and a
 * local date, plus the light mark for any moment.
 *
 * The sun calculation is NOAA's solar calculator (Meeus, "Astronomical
 * Algorithms"; https://gml.noaa.gov/grad/solcalc/calcdetails.html), accurate
 * to about two minutes between 72 degrees north and south and still usable above.
 * It is a new, pure implementation: `packages/api/src/weather.ts` holds a
 * private sunrise/sunset-only approximation that a later package can replace
 * with this one.
 */
import type { CivilDate } from "./zoned-time";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86_400_000;

/** Zenith angles in degrees. Sunrise and sunset include refraction and the solar disc. */
export const ZENITH = {
  sunriseSunset: 90.833,
  civil: 96,
  /** Golden hour by sun elevation: 6 degrees above the horizon. Used only when `goldenHourElevationDeg` is passed. */
  goldenHour: 84,
} as const;

/**
 * Default golden hour: it starts this many minutes before sunset. This is the
 * owner's brand-book sample (sunset 4:45 PM, golden hour 3:45 PM) and what
 * every design board shows. Pass `goldenHourElevationDeg` to `sunTimes` to
 * use the sun's elevation instead (6 degrees is the usual photographer's rule).
 */
export const GOLDEN_HOUR_LEAD_MINUTES = 60;

export type DaylightKind = "normal" | "polar-day" | "polar-night";

export interface SunTimes {
  /** Epoch milliseconds; `null` when the sun does not cross the horizon that day. */
  readonly sunrise: number | null;
  readonly sunset: number | null;
  /** Civil dawn / dusk (sun 6 degrees below the horizon); `null` in white nights or polar night. */
  readonly civilDawn: number | null;
  readonly civilDusk: number | null;
  /** Evening golden hour begins: 60 minutes before sunset by default (see `GOLDEN_HOUR_LEAD_MINUTES`); `null` without a sunset. */
  readonly goldenHourStart: number | null;
  readonly solarNoon: number;
  readonly daylight: DaylightKind;
  /**
   * The sun stays above civil twilight all night (white night): there is no
   * civil dawn or dusk although the sun does set.
   */
  readonly whiteNight: boolean;
}

interface SunPosition {
  readonly declinationRad: number;
  readonly equationOfTimeMin: number;
}

function sunPosition(instantMs: number): SunPosition {
  const jd = instantMs / DAY_MS + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mr = m * RAD;
  const c =
    Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mr) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mr) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const declinationRad = Math.asin(
    Math.sin(obliq * RAD) * Math.sin(appLong * RAD),
  );
  const y = Math.tan((obliq * RAD) / 2) ** 2;
  const l0r = l0 * RAD;
  const equationOfTimeMin =
    4 *
    DEG *
    (y * Math.sin(2 * l0r) -
      2 * e * Math.sin(mr) +
      4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
      0.5 * y * y * Math.sin(4 * l0r) -
      1.25 * e * e * Math.sin(2 * mr));
  return { declinationRad, equationOfTimeMin };
}

type Crossing =
  | { readonly kind: "crosses"; readonly rise: number; readonly set: number }
  | { readonly kind: "always-above" }
  | { readonly kind: "always-below" };

/** The instants on a local date at which the sun is at a zenith angle. */
function crossing(
  midnightUtcMs: number,
  latitude: number,
  longitude: number,
  zenithDeg: number,
): Crossing {
  const latRad = latitude * RAD;
  const hourAngle = (position: SunPosition): { cos: number; noon: number } => ({
    cos:
      Math.cos(zenithDeg * RAD) /
        (Math.cos(latRad) * Math.cos(position.declinationRad)) -
      Math.tan(latRad) * Math.tan(position.declinationRad),
    noon: 720 - 4 * longitude - position.equationOfTimeMin,
  });

  let rise = midnightUtcMs + (720 - 4 * longitude) * 60_000;
  let set = rise;
  const atNoon = hourAngle(sunPosition(rise));
  if (atNoon.cos < -1) return { kind: "always-above" };
  if (atNoon.cos > 1) return { kind: "always-below" };

  // Evaluate the sun at the estimated event time, then refine twice.
  for (let pass = 0; pass < 3; pass += 1) {
    const r = hourAngle(sunPosition(rise));
    const s = hourAngle(sunPosition(set));
    const clampCos = (cos: number): number => Math.min(1, Math.max(-1, cos));
    rise =
      midnightUtcMs + (r.noon - 4 * Math.acos(clampCos(r.cos)) * DEG) * 60_000;
    set =
      midnightUtcMs + (s.noon + 4 * Math.acos(clampCos(s.cos)) * DEG) * 60_000;
  }
  return { kind: "crosses", rise, set };
}

function goldenHourStart(
  horizon: Crossing,
  midnight: number,
  latitude: number,
  longitude: number,
  options: { readonly goldenHourElevationDeg?: number },
): number | null {
  if (options.goldenHourElevationDeg !== undefined) {
    const golden = crossing(
      midnight,
      latitude,
      longitude,
      90 - options.goldenHourElevationDeg,
    );
    return golden.kind === "crosses" ? golden.set : null;
  }
  return horizon.kind === "crosses"
    ? horizon.set - GOLDEN_HOUR_LEAD_MINUTES * 60_000
    : null;
}

/**
 * Sun times for the LOCAL calendar date at a place. The date is the date on
 * the venue's wall calendar; no time zone is needed because the local solar
 * day is anchored on solar noon.
 */
export function sunTimes(
  latitude: number,
  longitude: number,
  date: CivilDate,
  options: { readonly goldenHourElevationDeg?: number } = {},
): SunTimes {
  const midnight = Date.UTC(date.year, date.month - 1, date.day);
  const noonPosition = sunPosition(midnight + (720 - 4 * longitude) * 60_000);
  const solarNoon =
    midnight + (720 - 4 * longitude - noonPosition.equationOfTimeMin) * 60_000;

  const horizon = crossing(midnight, latitude, longitude, ZENITH.sunriseSunset);
  const civil = crossing(midnight, latitude, longitude, ZENITH.civil);
  const crosses = horizon.kind === "crosses";
  const daylight: DaylightKind = crosses
    ? "normal"
    : horizon.kind === "always-above"
      ? "polar-day"
      : "polar-night";

  return {
    sunrise: horizon.kind === "crosses" ? horizon.rise : null,
    sunset: horizon.kind === "crosses" ? horizon.set : null,
    civilDawn: civil.kind === "crosses" ? civil.rise : null,
    civilDusk: civil.kind === "crosses" ? civil.set : null,
    goldenHourStart: goldenHourStart(
      horizon,
      midnight,
      latitude,
      longitude,
      options,
    ),
    solarNoon,
    daylight,
    whiteNight: crosses && civil.kind === "always-above",
  };
}

export type LightMark =
  "daylight" | "golden-hour" | "under-lights" | "dark" | "first-light";

export interface LightContext {
  readonly sun: SunTimes;
  /** The court has lights and they are available at this time. */
  readonly courtIsLit: boolean;
}

/**
 * The light mark at an instant.
 *
 * - A lit court is `under-lights` whenever the sun is down.
 * - Unlit: `first-light` from civil dawn to sunrise, `daylight` from sunrise
 *   to golden hour, `golden-hour` from golden hour to sunset, otherwise `dark`
 *   (the contract has no evening twilight state).
 * - Polar day is `daylight`; polar night is `dark` (or `under-lights`).
 *
 * `time` is epoch milliseconds from the caller.
 */
export function lightMarkFor(time: number, context: LightContext): LightMark {
  const { sun, courtIsLit } = context;
  const sunDown: LightMark = courtIsLit ? "under-lights" : "dark";

  if (sun.daylight === "polar-day") return "daylight";
  if (sun.sunrise === null || sun.sunset === null) return sunDown;

  if (time < sun.sunrise) {
    if (courtIsLit) return "under-lights";
    // In a white night there is no civil dawn: it is twilight all night.
    return sun.whiteNight || (sun.civilDawn !== null && time >= sun.civilDawn)
      ? "first-light"
      : "dark";
  }
  if (time >= sun.sunset) return sunDown;
  if (sun.goldenHourStart !== null && time >= sun.goldenHourStart)
    return "golden-hour";
  return "daylight";
}

export interface CourtLight {
  readonly id: string;
  readonly isLit: boolean;
}

export interface DayLineParts {
  /** When golden hour starts; `null` if there is none that day. */
  readonly goldenHourAt: number | null;
  readonly sunsetAt: number | null;
  /** Civil dusk: the last usable natural light. */
  readonly lastLightAt: number | null;
  /** From when lit courts need their lights: sunset. */
  readonly lightsOnAt: number | null;
  readonly courts: {
    readonly total: number;
    readonly litIds: ReadonlyArray<string>;
    readonly unlitIds: ReadonlyArray<string>;
    readonly allLit: boolean;
    readonly noneLit: boolean;
  };
  readonly daylight: DaylightKind;
}

/** The pieces of the day line ("Golden hour 3:45 PM · Sunset 4:45 PM · 2 of 4 courts lit"). */
export function dayLineParts(
  sun: SunTimes,
  courts: ReadonlyArray<CourtLight>,
): DayLineParts {
  const litIds = courts.filter((c) => c.isLit).map((c) => c.id);
  const unlitIds = courts.filter((c) => !c.isLit).map((c) => c.id);
  return {
    goldenHourAt: sun.goldenHourStart,
    sunsetAt: sun.sunset,
    lastLightAt: sun.civilDusk,
    lightsOnAt: litIds.length > 0 ? sun.sunset : null,
    courts: {
      total: courts.length,
      litIds,
      unlitIds,
      allLit: courts.length > 0 && unlitIds.length === 0,
      noneLit: litIds.length === 0,
    },
    daylight: sun.daylight,
  };
}
