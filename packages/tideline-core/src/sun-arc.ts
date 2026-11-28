/**
 * The sun arc: where the sun is on its path today, how much light is left,
 * and, after sunset, how long until first light. Instants in, fractions and
 * minutes out; the drawing is the renderer's.
 */
import type { SunTimes } from "./light";

const MINUTE_MS = 60_000;

export type SunArcPhase =
  | "before-sunrise"
  | "daylight"
  | "golden-hour"
  | "after-sunset"
  | "polar-day"
  | "polar-night";

export interface SunArcModel {
  readonly phase: SunArcPhase;
  /** How far the sun is along sunrise → sunset, 0 to 1 (clamped). */
  readonly progress: number;
  /** Where golden hour starts along the arc, 0 to 1; `null` without one. */
  readonly goldenFrom: number | null;
  /** Whole minutes of daylight left (0 once the sun has set). */
  readonly minutesOfLightLeft: number;
  /** Whole minutes until first light, before sunrise or after sunset; `null` otherwise. */
  readonly minutesUntilFirstLight: number | null;
}

/**
 * `nextSunrise` is tomorrow's sunrise (from `sunTimes` for the next date);
 * without it, after sunset counts to today's sunrise plus a day, which is
 * within a few minutes away from the poles.
 */
export function sunArcModel(
  sun: SunTimes,
  now: number,
  options: { readonly nextSunrise?: number | null } = {},
): SunArcModel {
  if (sun.daylight === "polar-day") {
    return {
      phase: "polar-day",
      progress: 0.5,
      goldenFrom: null,
      minutesOfLightLeft: 0,
      minutesUntilFirstLight: null,
    };
  }
  if (sun.sunrise === null || sun.sunset === null) {
    return {
      phase: "polar-night",
      progress: 0,
      goldenFrom: null,
      minutesOfLightLeft: 0,
      minutesUntilFirstLight: null,
    };
  }
  const length = sun.sunset - sun.sunrise;
  const progress = Math.min(1, Math.max(0, (now - sun.sunrise) / length));
  const goldenFrom =
    sun.goldenHourStart === null
      ? null
      : Math.min(1, Math.max(0, (sun.goldenHourStart - sun.sunrise) / length));
  const minutes = (ms: number): number =>
    Math.max(0, Math.round(ms / MINUTE_MS));
  if (now < sun.sunrise) {
    return {
      phase: "before-sunrise",
      progress: 0,
      goldenFrom,
      minutesOfLightLeft: minutes(length),
      minutesUntilFirstLight: minutes(sun.sunrise - now),
    };
  }
  if (now >= sun.sunset) {
    const next = options.nextSunrise ?? sun.sunrise + 86_400_000;
    return {
      phase: "after-sunset",
      progress: 1,
      goldenFrom,
      minutesOfLightLeft: 0,
      minutesUntilFirstLight: minutes(next - now),
    };
  }
  return {
    phase:
      sun.goldenHourStart !== null && now >= sun.goldenHourStart
        ? "golden-hour"
        : "daylight",
    progress,
    goldenFrom,
    minutesOfLightLeft: minutes(sun.sunset - now),
    minutesUntilFirstLight: null,
  };
}

/** "1 h 35 min", "45 min", "2 h": for light left and time until first light. */
export function formatSpan(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  if (rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}
