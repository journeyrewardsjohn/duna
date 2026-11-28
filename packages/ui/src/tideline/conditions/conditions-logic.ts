/**
 * How the conditions components turn the core's numbers into words. The
 * rules (play call, thresholds, chips, freshness, which end the wind favours)
 * are all `@duna/tideline-core`; this file only picks words and icons. No
 * "use client": pure, and tested in `conditions.test.ts`.
 */
import {
  CHIP_GUST_KPH,
  CHIP_WIND_KPH,
  CONDITION_REASON_WORDS,
  CONDITIONS_FRESH_MINUTES,
  celsiusToFahrenheit,
  conditionsFreshness,
  conditionsLine,
  compassPoint,
  formatSpan,
  kphToMph,
  PLAY_CALL_CRESTS,
  PLAY_CALL_WORDS,
  playCall,
  type ConditionReason,
  type ConditionThresholds,
  type ConditionsPart,
  type HourlyConditions,
  type PlayCall,
  type UnitSystem,
} from "@duna/tideline-core";

/** What the component knows about its data. */
export type ConditionsStatus =
  "ready" | "loading" | "no-data" | "not-configured";

export interface PlayCallView {
  call: PlayCall;
  /** "Good to play", "Caution", "Stop play". */
  words: string;
  /** The reason as a lead ("Gusty", "Rain likely", or the caller's "Lightning 8 mi away"). */
  reason: string | null;
  /** The core's reason, when the numbers made the call (not the service). */
  reasonKind: ConditionReason | null;
  crests: number;
  icon: "success" | "alert" | "lightning";
}

export function playCallView(
  hour: HourlyConditions,
  options: {
    readonly thresholds?: Partial<ConditionThresholds>;
    /** The service's own call (lightning, a club closure) wins over the numbers. */
    readonly call?: PlayCall;
    readonly reason?: string;
  } = {},
): PlayCallView {
  const computed = playCall(hour, options.thresholds);
  const call = options.call ?? computed.call;
  const reason =
    options.reason ??
    (computed.reason !== null && call !== "good"
      ? CONDITION_REASON_WORDS[computed.reason]
      : null);
  return {
    call,
    words: PLAY_CALL_WORDS[call],
    reason,
    reasonKind: options.reason ? null : computed.reason,
    crests: PLAY_CALL_CRESTS[call],
    icon:
      call === "stop" ? "lightning" : call === "caution" ? "alert" : "success",
  };
}

export interface Reading {
  key: "wind" | "gusts" | "uv" | "rain";
  label: string;
  value: string;
}

const speedIn = (kph: number, units: UnitSystem): number =>
  Math.round(units === "us" ? kphToMph(kph) : kph);
const speedUnit = (units: UnitSystem): string =>
  units === "us" ? "mph" : "km/h";

/** "68°F" / "20°C". */
export function temperatureText(c: number, units: UnitSystem): string {
  return `${Math.round(units === "us" ? celsiusToFahrenheit(c) : c)}°${units === "us" ? "F" : "C"}`;
}

/** "W 9 mph": the compass point first, calm winds without one. */
export function windText(
  hour: HourlyConditions,
  units: UnitSystem,
): string | null {
  if (hour.windSpeedKph === undefined) return null;
  const line = conditionsLine(
    {
      at: hour.at,
      windSpeedKph: hour.windSpeedKph,
      windFromDeg: hour.windFromDeg,
    },
    { units },
  );
  const part = line.parts.find((p) => p.kind === "wind");
  return (
    part?.text ?? `${speedIn(hour.windSpeedKph, units)} ${speedUnit(units)}`
  );
}

/** The four readings under the play call, only those the forecast has. */
export function readings(hour: HourlyConditions, units: UnitSystem): Reading[] {
  const out: Reading[] = [];
  if (hour.windSpeedKph !== undefined) {
    const compass =
      hour.windFromDeg !== undefined
        ? `${compassPoint(hour.windFromDeg)} `
        : "";
    out.push({
      key: "wind",
      label: "Wind",
      value: `${compass}${speedIn(hour.windSpeedKph, units)} ${speedUnit(units)}`,
    });
  }
  if (hour.windGustKph !== undefined) {
    out.push({
      key: "gusts",
      label: "Gusts",
      value: `${speedIn(hour.windGustKph, units)} ${speedUnit(units)}`,
    });
  }
  if (hour.uvIndex !== undefined) {
    out.push({
      key: "uv",
      label: "UV",
      value: String(Math.round(hour.uvIndex)),
    });
  }
  if (hour.precipChancePct !== undefined) {
    out.push({
      key: "rain",
      label: "Rain",
      value: `${Math.round(hour.precipChancePct)}%`,
    });
  }
  return out;
}

/** The wind chip ("Gusty 14 mph", "Windy 12 mph") when it changes the plan, else `null`. */
export function windChip(
  hour: HourlyConditions,
  units: UnitSystem,
): string | null {
  const gust = hour.windGustKph ?? 0;
  const steady = hour.windSpeedKph ?? 0;
  if (gust >= CHIP_GUST_KPH)
    return `Gusty ${speedIn(gust, units)} ${speedUnit(units)}`;
  if (steady >= CHIP_WIND_KPH)
    return `Windy ${speedIn(steady, units)} ${speedUnit(units)}`;
  return null;
}

/** Light, steady or strong, from the sustained wind in mph (crests 1 to 3). */
export function windStrength(kph: number): { word: string; crests: number } {
  const mph = kphToMph(kph);
  if (mph >= 18) return { word: "Strong", crests: 3 };
  if (mph >= 10) return { word: "Steady", crests: 2 };
  return { word: "Light", crests: 1 };
}

export interface Freshness {
  stale: boolean;
  /** "2 h ago", "45 min ago". */
  ago: string;
}

export function freshness(
  readAt: number | undefined,
  now: number | undefined,
  freshMinutes: number = CONDITIONS_FRESH_MINUTES,
): Freshness | null {
  if (readAt === undefined || now === undefined) return null;
  const f = conditionsFreshness(readAt, now, freshMinutes);
  return {
    stale: f.stale,
    ago: f.ageMinutes < 1 ? "just now" : `${formatSpan(f.ageMinutes)} ago`,
  };
}

/** The parts of the one-line summary, in the core's priority order. */
export function lineParts(
  hour: HourlyConditions,
  options: {
    readonly units: UnitSystem;
    readonly sunsetAt?: number | null;
    readonly thresholds?: Partial<ConditionThresholds>;
  },
): { call: PlayCall; parts: ReadonlyArray<ConditionsPart> } {
  const line = conditionsLine(hour, {
    units: options.units,
    sunsetAt: options.sunsetAt ?? null,
    thresholds: options.thresholds,
  });
  return { call: line.call, parts: line.parts };
}
