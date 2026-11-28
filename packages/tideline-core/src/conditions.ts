/**
 * Outdoor conditions: the play call, wind relative to the court, whether a
 * row deserves a weather chip, and the conditions line.
 *
 * Inputs follow the repo's forecast contract: degrees Celsius, kilometres per
 * hour, percent, degrees clockwise from north. This is a US product, so the
 * default thresholds are defined in mph and degrees F (the owner reviews
 * those) and the conditions line displays US customary units unless told
 * otherwise.
 *
 * Every threshold below is a DEFAULT. A club may change them; pass a partial
 * override as `thresholds`. The owner has not agreed the contract's "play
 * call" wording yet (design README, open questions), so treat the numbers as
 * proposals.
 */

/** Unit system for display and thresholds. The package never infers it from a device: callers pass it. */
export type UnitSystem = "us" | "metric";

/** Display default: this is a US product, so US customary unless told otherwise. */
export const DEFAULT_UNIT_SYSTEM: UnitSystem = "us";

const KPH_PER_MPH = 1.609344;
export const mphToKph = (mph: number): number => mph * KPH_PER_MPH;
export const kphToMph = (kph: number): number => kph / KPH_PER_MPH;
export const fahrenheitToCelsius = (f: number): number => ((f - 32) * 5) / 9;
export const celsiusToFahrenheit = (c: number): number => (c * 9) / 5 + 32;

/**
 * The default thresholds in US customary units: mph and degrees Fahrenheit.
 * These are the numbers the owner reviews, and the single source: the metric
 * thresholds below are converted from them. A club may change any of them.
 */
export interface ConditionThresholdsUs {
  /** Caution from this sustained wind (mph). */
  readonly cautionWindMph: number;
  readonly stopWindMph: number;
  readonly cautionGustMph: number;
  readonly stopGustMph: number;
  /** Chance of precipitation (percent). */
  readonly cautionPrecipPct: number;
  readonly stopPrecipPct: number;
  /** Air temperature (F), hot side. */
  readonly cautionHeatF: number;
  readonly stopHeatF: number;
  /** Air temperature (F), cold side: at or below. */
  readonly cautionColdF: number;
  readonly stopColdF: number;
  readonly cautionUv: number;
  readonly stopUv: number;
}

/** Defaults a club may change (mph, F). */
export const DEFAULT_CONDITION_THRESHOLDS_US: ConditionThresholdsUs = {
  cautionWindMph: 20,
  stopWindMph: 30,
  cautionGustMph: 30,
  stopGustMph: 40,
  cautionPrecipPct: 40,
  stopPrecipPct: 80,
  cautionHeatF: 90,
  stopHeatF: 100,
  cautionColdF: 40,
  stopColdF: 30,
  cautionUv: 8,
  stopUv: 11,
};

/** The same thresholds in km/h and degrees Celsius, the units of the forecast contract. */
export interface ConditionThresholds {
  readonly cautionWindKph: number;
  readonly stopWindKph: number;
  readonly cautionGustKph: number;
  readonly stopGustKph: number;
  readonly cautionPrecipPct: number;
  readonly stopPrecipPct: number;
  readonly cautionHeatC: number;
  readonly stopHeatC: number;
  readonly cautionColdC: number;
  readonly stopColdC: number;
  readonly cautionUv: number;
  readonly stopUv: number;
}

const US = DEFAULT_CONDITION_THRESHOLDS_US;

/** Defaults a club may change (km/h, C), converted from the US table. Overrides to `playCall` use these units. */
export const DEFAULT_CONDITION_THRESHOLDS: ConditionThresholds = {
  cautionWindKph: mphToKph(US.cautionWindMph),
  stopWindKph: mphToKph(US.stopWindMph),
  cautionGustKph: mphToKph(US.cautionGustMph),
  stopGustKph: mphToKph(US.stopGustMph),
  cautionPrecipPct: US.cautionPrecipPct,
  stopPrecipPct: US.stopPrecipPct,
  cautionHeatC: fahrenheitToCelsius(US.cautionHeatF),
  stopHeatC: fahrenheitToCelsius(US.stopHeatF),
  cautionColdC: fahrenheitToCelsius(US.cautionColdF),
  stopColdC: fahrenheitToCelsius(US.stopColdF),
  cautionUv: US.cautionUv,
  stopUv: US.stopUv,
};

/**
 * A good-weather row still gets a chip from this steady wind (mph): it changes
 * which end to take. A default a club may change.
 */
export const CHIP_WIND_MPH = 12;
/**
 * ... or from this gust (mph): "Gusty 14 mph" gets a chip, a steady 9 mph
 * westerly does not.
 */
export const CHIP_GUST_MPH = 14;
export const CHIP_WIND_KPH = mphToKph(CHIP_WIND_MPH);
export const CHIP_GUST_KPH = mphToKph(CHIP_GUST_MPH);
/** Chance of rain (percent) from which the conditions line mentions rain. */
export const LINE_RAIN_PCT = 20;
/** UV index from which the conditions line mentions UV. */
export const LINE_UV = 6;

export interface HourlyConditions {
  /** Epoch milliseconds of the hour. */
  readonly at: number;
  readonly temperatureC?: number;
  readonly windSpeedKph?: number;
  readonly windGustKph?: number;
  /** Direction the wind comes FROM, degrees clockwise from north. */
  readonly windFromDeg?: number;
  readonly precipChancePct?: number;
  readonly uvIndex?: number;
}

export type PlayCall = "good" | "caution" | "stop";
export type ConditionReason =
  "rain" | "gusts" | "wind" | "heat" | "cold" | "uv";

/** Reasons in the order they win a tie at the same level. */
const REASON_ORDER: ReadonlyArray<ConditionReason> = [
  "rain",
  "gusts",
  "wind",
  "heat",
  "cold",
  "uv",
];

export interface PlayCallResult {
  readonly call: PlayCall;
  /** The leading reason; `null` for `good`. */
  readonly reason: ConditionReason | null;
  /** Every reason at the reported level, in tie order. */
  readonly reasons: ReadonlyArray<ConditionReason>;
}

function levelsFor(
  hour: HourlyConditions,
  t: ConditionThresholds,
): Map<ConditionReason, "caution" | "stop"> {
  const out = new Map<ConditionReason, "caution" | "stop">();
  const grade = (
    reason: ConditionReason,
    value: number | undefined,
    caution: number,
    stop: number,
    direction: "high" | "low" = "high",
  ): void => {
    if (value === undefined) return;
    const past = (limit: number): boolean =>
      direction === "high" ? value >= limit : value <= limit;
    if (past(stop)) out.set(reason, "stop");
    else if (past(caution)) out.set(reason, "caution");
  };
  grade("rain", hour.precipChancePct, t.cautionPrecipPct, t.stopPrecipPct);
  grade("gusts", hour.windGustKph, t.cautionGustKph, t.stopGustKph);
  grade("wind", hour.windSpeedKph, t.cautionWindKph, t.stopWindKph);
  grade("heat", hour.temperatureC, t.cautionHeatC, t.stopHeatC);
  grade("cold", hour.temperatureC, t.cautionColdC, t.stopColdC, "low");
  grade("uv", hour.uvIndex, t.cautionUv, t.stopUv);
  return out;
}

export function playCall(
  hour: HourlyConditions,
  thresholds: Partial<ConditionThresholds> = {},
): PlayCallResult {
  const levels = levelsFor(hour, {
    ...DEFAULT_CONDITION_THRESHOLDS,
    ...thresholds,
  });
  const call: PlayCall = [...levels.values()].includes("stop")
    ? "stop"
    : levels.size > 0
      ? "caution"
      : "good";
  if (call === "good") return { call, reason: null, reasons: [] };
  const reasons = REASON_ORDER.filter((reason) => levels.get(reason) === call);
  return { call, reason: reasons[0] ?? null, reasons };
}

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const COMPASS: ReadonlyArray<CompassPoint> = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

/** Eight-point compass label for a bearing. */
export function compassPoint(deg: number): CompassPoint {
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[index] as CompassPoint;
}

export interface WindOnCourt {
  /** Wind speed along the court's long axis (km/h, 0 or more). */
  readonly alongKph: number;
  /** Wind speed across the court (km/h, 0 or more). */
  readonly crossKph: number;
  readonly alongMph: number;
  readonly crossMph: number;
  readonly dominant: "along" | "cross" | "calm";
  /**
   * The good end: the end the wind comes from. A player standing there has the
   * wind at their back, which is the easier side. `null` unless the wind is
   * mostly along the court. Ends are named by the compass bearing from the
   * centre of the court to that end.
   */
  readonly goodEndBearingDeg: number | null;
  readonly goodEndCompass: CompassPoint | null;
  /** The wind's own compass point ("from NW"). */
  readonly windFromCompass: CompassPoint | null;
}

/** Winds under this (mph) are calm for the purposes of choosing an end. */
export const CALM_WIND_MPH = 3;
export const CALM_WIND_KPH = mphToKph(CALM_WIND_MPH);

/**
 * Wind relative to a court. `orientationDeg` is the bearing of the court's
 * long axis (end to end), in any direction along it: 0 and 180 are the same
 * court.
 */
export function windOnCourt(
  windSpeedKph: number,
  windFromDeg: number,
  orientationDeg: number,
): WindOnCourt {
  const angle = ((windFromDeg - orientationDeg) * Math.PI) / 180;
  const along = Math.cos(angle) * windSpeedKph;
  const cross = Math.sin(angle) * windSpeedKph;
  const alongKph = Math.abs(along);
  const crossKph = Math.abs(cross);
  const dominant =
    windSpeedKph < CALM_WIND_KPH
      ? "calm"
      : alongKph >= crossKph
        ? "along"
        : "cross";
  const goodEnd =
    dominant === "along"
      ? along >= 0
        ? orientationDeg
        : orientationDeg + 180
      : null;
  const normalised = goodEnd === null ? null : ((goodEnd % 360) + 360) % 360;
  return {
    alongKph: round1(alongKph),
    crossKph: round1(crossKph),
    alongMph: round1(kphToMph(alongKph)),
    crossMph: round1(kphToMph(crossKph)),
    dominant,
    goodEndBearingDeg: normalised,
    goodEndCompass: normalised === null ? null : compassPoint(normalised),
    windFromCompass: dominant === "calm" ? null : compassPoint(windFromDeg),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Whether a schedule row deserves a weather chip: only when the weather
 * changes what a coach or player does. That is any caution or stop, or a
 * steady wind (12 mph) or gust (14 mph) strong enough that the choice of end
 * matters. A steady 9 mph westerly gets none.
 */
export function needsWeatherChip(
  hour: HourlyConditions,
  thresholds: Partial<ConditionThresholds> = {},
): boolean {
  if (playCall(hour, thresholds).call !== "good") return true;
  return (
    (hour.windSpeedKph ?? 0) >= CHIP_WIND_KPH ||
    (hour.windGustKph ?? 0) >= CHIP_GUST_KPH
  );
}

export type ConditionsPartKind =
  "reason" | "wind" | "temp" | "rain" | "uv" | "sunset";

export interface ConditionsPart {
  readonly kind: ConditionsPartKind;
  /** 1 is most important. Parts come back in priority order. */
  readonly priority: number;
  /** English text for wind, temperature, rain and UV in the line's unit system, e.g. "W 9 mph", "Gusty 14 mph", "72\u00b0F". */
  readonly text?: string;
  readonly reason?: ConditionReason;
  /** Rounded, in the line's unit system. */
  readonly temperature?: number;
  /** Rounded sustained wind, in the line's unit system. */
  readonly windSpeed?: number;
  /** Rounded gust, in the line's unit system (only when gusty). */
  readonly windGust?: number;
  /** The wind is gusty: the text shows the gust speed. */
  readonly gusty?: boolean;
  readonly windFromCompass?: CompassPoint;
  readonly precipChancePct?: number;
  readonly uvIndex?: number;
  /** Epoch ms of sunset. */
  readonly sunsetAt?: number;
}

export interface ConditionsLine {
  readonly call: PlayCall;
  readonly units: UnitSystem;
  /** In priority order; the renderer prints them in this order. */
  readonly parts: ReadonlyArray<ConditionsPart>;
}

/**
 * The conditions line, parts in priority order:
 * reason (only when not good), wind, temperature, rain, UV, sunset.
 *
 * `units` is explicit and defaults to US customary (mph, degrees F); the
 * package never reads a device locale. Wind reads "W 9 mph"; when the gust
 * reaches the chip gust threshold it reads "Gusty 14 mph" with the gust speed.
 */
export function conditionsLine(
  hour: HourlyConditions,
  options: {
    readonly sunsetAt?: number | null;
    readonly thresholds?: Partial<ConditionThresholds>;
    readonly units?: UnitSystem;
  } = {},
): ConditionsLine {
  const units = options.units ?? DEFAULT_UNIT_SYSTEM;
  const us = units === "us";
  const speedUnit = us ? "mph" : "km/h";
  const speed = (kph: number): number => Math.round(us ? kphToMph(kph) : kph);
  const result = playCall(hour, options.thresholds);
  const parts: Omit<ConditionsPart, "priority">[] = [];
  if (result.reason !== null)
    parts.push({ kind: "reason", reason: result.reason });
  if (hour.windSpeedKph !== undefined) {
    const compass =
      hour.windFromDeg !== undefined && hour.windSpeedKph >= CALM_WIND_KPH
        ? compassPoint(hour.windFromDeg)
        : undefined;
    const gusty = (hour.windGustKph ?? 0) >= CHIP_GUST_KPH;
    const windSpeed = speed(hour.windSpeedKph);
    const windGust = speed(hour.windGustKph ?? 0);
    const text = gusty
      ? `Gusty ${windGust} ${speedUnit}`
      : `${compass ? `${compass} ` : ""}${windSpeed} ${speedUnit}`;
    parts.push({
      kind: "wind",
      text,
      windSpeed,
      gusty,
      ...(gusty ? { windGust } : {}),
      ...(compass ? { windFromCompass: compass } : {}),
    });
  }
  if (hour.temperatureC !== undefined) {
    const temperature = Math.round(
      us ? celsiusToFahrenheit(hour.temperatureC) : hour.temperatureC,
    );
    parts.push({
      kind: "temp",
      temperature,
      text: `${temperature}\u00b0${us ? "F" : "C"}`,
    });
  }
  if ((hour.precipChancePct ?? 0) >= LINE_RAIN_PCT) {
    const pct = Math.round(hour.precipChancePct ?? 0);
    parts.push({ kind: "rain", precipChancePct: pct, text: `${pct}% rain` });
  }
  if ((hour.uvIndex ?? 0) >= LINE_UV) {
    const uv = Math.round(hour.uvIndex ?? 0);
    parts.push({ kind: "uv", uvIndex: uv, text: `UV ${uv}` });
  }
  if (options.sunsetAt != null)
    parts.push({ kind: "sunset", sunsetAt: options.sunsetAt });
  return {
    call: result.call,
    units,
    parts: parts.map((part, index) => ({ ...part, priority: index + 1 })),
  };
}

/**
 * Fit a conditions line into `maxParts` slots. The LOWEST priority part is
 * dropped first (sunset, then UV, then rain, then temperature, then wind); the
 * reason, when present, is never dropped. Order is preserved.
 */
export function fitConditionsLine(
  line: ConditionsLine,
  maxParts: number,
): ReadonlyArray<ConditionsPart> {
  const limit = Math.max(0, Math.floor(maxParts));
  const keep = new Set(
    [...line.parts]
      .sort((a, b) => a.priority - b.priority)
      .slice(0, Math.max(limit, line.parts[0]?.kind === "reason" ? 1 : 0))
      .map((part) => part.priority),
  );
  return line.parts.filter((part) => keep.has(part.priority));
}
