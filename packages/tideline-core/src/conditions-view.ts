/**
 * What a conditions display says around the numbers: is the reading fresh,
 * the play call in words and crests, and the wind relative to a court in a
 * sentence. Pure and English; renderers may translate.
 */
import {
  compassPoint,
  type ConditionReason,
  type PlayCall,
  type WindOnCourt,
} from "./conditions";

const MINUTE_MS = 60_000;

/**
 * A reading older than this is stale: the forecast is cached for 30 minutes
 * (`packages/api/src/weather.ts`), so twice that means a refresh failed. The
 * conditions service may pass its own window.
 */
export const CONDITIONS_FRESH_MINUTES = 60;

export interface ConditionsFreshness {
  readonly stale: boolean;
  /** Whole minutes since the reading (0 for a reading from the future). */
  readonly ageMinutes: number;
}

export function conditionsFreshness(
  readAt: number,
  now: number,
  freshMinutes: number = CONDITIONS_FRESH_MINUTES,
): ConditionsFreshness {
  const age = Math.max(0, Math.floor((now - readAt) / MINUTE_MS));
  return { stale: age > freshMinutes, ageMinutes: age };
}

/** Short words for the play call. Proposed wording (contract open question). */
export const PLAY_CALL_WORDS: Readonly<Record<PlayCall, string>> = {
  good: "Good to play",
  caution: "Caution",
  stop: "Stop play",
};

/** The play call scored in crests (brand book: good 3, playable 2, off 0). */
export const PLAY_CALL_CRESTS: Readonly<Record<PlayCall, number>> = {
  good: 3,
  caution: 2,
  stop: 0,
};

/** "Gusts", "Rain likely": the reason as a lead word for a caution or stop. */
export const CONDITION_REASON_WORDS: Readonly<Record<ConditionReason, string>> =
  {
    rain: "Rain likely",
    gusts: "Gusty",
    wind: "Windy",
    heat: "Hot",
    cold: "Cold",
    uv: "High UV",
  };

/** Compass words for a sentence: "NW" → "northwest". */
const COMPASS_WORDS: Readonly<Record<string, string>> = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
};

export function compassWords(deg: number): string {
  return COMPASS_WORDS[compassPoint(deg)] ?? "";
}

/**
 * The wind on a court as one sentence, in mph: "Wind from the northwest,
 * mostly along the court. The north end has the wind at your back." Named
 * ends ("ocean end") replace compass words when the venue names them.
 */
export function windOnCourtSentence(
  wind: WindOnCourt,
  options: {
    /** Names for the two ends by compass point of the end, e.g. { N: "Ocean end" }. */
    readonly endNames?: Readonly<Partial<Record<string, string>>>;
  } = {},
): string {
  if (wind.dominant === "calm") return "Calm: neither end is favoured.";
  const from = wind.windFromCompass
    ? `Wind from the ${COMPASS_WORDS[wind.windFromCompass]}`
    : "Wind";
  if (wind.dominant === "cross") {
    return `${from}, across the court: neither end is favoured.`;
  }
  const end = wind.goodEndCompass
    ? (options.endNames?.[wind.goodEndCompass] ??
      `The ${COMPASS_WORDS[wind.goodEndCompass]} end`)
    : "One end";
  return `${from}, along the court. ${end} has the wind at your back.`;
}
