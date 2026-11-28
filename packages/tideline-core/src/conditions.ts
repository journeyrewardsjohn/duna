/**
 * Outdoor conditions: the play call, wind relative to the court, whether a
 * row deserves a weather chip, and the conditions line.
 *
 * Units follow the repo's forecast contract: degrees Celsius, kilometres per
 * hour, percent, degrees clockwise from north.
 *
 * Every threshold below is a DEFAULT. A club may change them; pass a partial
 * override as `thresholds`. The owner has not agreed the contract's "play
 * call" wording yet (design README, open questions), so treat the numbers as
 * proposals.
 */

export interface ConditionThresholds {
  /** Caution from this sustained wind (km/h). */
  readonly cautionWindKph: number;
  /** Stop from this sustained wind (km/h). */
  readonly stopWindKph: number;
  readonly cautionGustKph: number;
  readonly stopGustKph: number;
  /** Chance of precipitation (percent). */
  readonly cautionPrecipPct: number;
  readonly stopPrecipPct: number;
  /** Air temperature (Celsius), hot side. */
  readonly cautionHeatC: number;
  readonly stopHeatC: number;
  /** Air temperature (Celsius), cold side. */
  readonly cautionColdC: number;
  readonly stopColdC: number;
  readonly cautionUv: number;
  readonly stopUv: number;
}

/** Defaults a club may change. */
export const DEFAULT_CONDITION_THRESHOLDS: ConditionThresholds = {
  cautionWindKph: 30,
  stopWindKph: 50,
  cautionGustKph: 45,
  stopGustKph: 65,
  cautionPrecipPct: 40,
  stopPrecipPct: 80,
  cautionHeatC: 32,
  stopHeatC: 38,
  cautionColdC: 5,
  stopColdC: -2,
  cautionUv: 8,
  stopUv: 11,
};

/** A good-weather row still gets a chip from this wind (km/h): it changes which end to take. */
export const CHIP_WIND_KPH = 20;
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

/** Winds under this (km/h) are calm for the purposes of choosing an end. */
export const CALM_WIND_KPH = 5;

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
 * changes what a coach or player does. That is any caution or stop, or a wind
 * strong enough that the choice of end matters.
 */
export function needsWeatherChip(
  hour: HourlyConditions,
  thresholds: Partial<ConditionThresholds> = {},
): boolean {
  if (playCall(hour, thresholds).call !== "good") return true;
  return (hour.windSpeedKph ?? 0) >= CHIP_WIND_KPH;
}

export type ConditionsPartKind =
  "reason" | "wind" | "temp" | "rain" | "uv" | "sunset";

export interface ConditionsPart {
  readonly kind: ConditionsPartKind;
  /** 1 is most important. Parts come back in priority order. */
  readonly priority: number;
  readonly reason?: ConditionReason;
  readonly temperatureC?: number;
  readonly windSpeedKph?: number;
  readonly windFromCompass?: CompassPoint;
  readonly precipChancePct?: number;
  readonly uvIndex?: number;
  /** Epoch ms of sunset. */
  readonly sunsetAt?: number;
}

export interface ConditionsLine {
  readonly call: PlayCall;
  /** In priority order; the renderer prints them in this order. */
  readonly parts: ReadonlyArray<ConditionsPart>;
}

/**
 * The conditions line, parts in priority order:
 * reason (only when not good), wind, temperature, rain, UV, sunset.
 */
export function conditionsLine(
  hour: HourlyConditions,
  options: {
    readonly sunsetAt?: number | null;
    readonly thresholds?: Partial<ConditionThresholds>;
  } = {},
): ConditionsLine {
  const result = playCall(hour, options.thresholds);
  const parts: Omit<ConditionsPart, "priority">[] = [];
  if (result.reason !== null)
    parts.push({ kind: "reason", reason: result.reason });
  if (hour.windSpeedKph !== undefined) {
    parts.push({
      kind: "wind",
      windSpeedKph: Math.round(hour.windSpeedKph),
      ...(hour.windFromDeg !== undefined && hour.windSpeedKph >= CALM_WIND_KPH
        ? { windFromCompass: compassPoint(hour.windFromDeg) }
        : {}),
    });
  }
  if (hour.temperatureC !== undefined) {
    parts.push({ kind: "temp", temperatureC: Math.round(hour.temperatureC) });
  }
  if ((hour.precipChancePct ?? 0) >= LINE_RAIN_PCT) {
    parts.push({
      kind: "rain",
      precipChancePct: Math.round(hour.precipChancePct ?? 0),
    });
  }
  if ((hour.uvIndex ?? 0) >= LINE_UV) {
    parts.push({ kind: "uv", uvIndex: Math.round(hour.uvIndex ?? 0) });
  }
  if (options.sunsetAt != null)
    parts.push({ kind: "sunset", sunsetAt: options.sunsetAt });
  return {
    call: result.call,
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
