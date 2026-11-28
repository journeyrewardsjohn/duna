/**
 * Pure rules for an anonymous score draft: tokens, which steps are complete,
 * and how a score is checked. No database, no clock of its own.
 *
 * Score checks reuse the product's own rules rather than restating them:
 * - the beach format (`standardBeachFormat` from `@duna/league-engine`: sets to
 *   21, a deciding set to 15, won by 2) gives the soft "doesn't look
 *   finished" check, which never blocks (docs/design/website.md 2.5);
 * - the hard checks are the ones `recordCompletedMatch` applies when the draft
 *   is claimed (a winner by two in every set; the match ends the moment one
 *   side wins the sets it needed), so a draft that saves can always be
 *   claimed; `ratingEvidenceProblem` asks the rating engine itself
 *   (`performanceEvidenceFromSetScores`) whether the result is decided.
 */
import { createHash, randomBytes } from "node:crypto";
import { standardBeachFormat } from "@duna/league-engine";
import { performanceEvidenceFromSetScores } from "@duna/rating";
import {
  ADD_SCORE_MAX_AGE_DAYS,
  type AddScoreDraftData,
  type AddScoreSet,
  type AddScoreStep,
} from "../../contracts/add-score";

/** A new draft token: 32 random bytes, base64url (43 characters). */
export function newDraftToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database keeps instead of the token. */
export function hashDraftToken(token: string): string {
  return createHash("sha256").update(`duna-score-draft:${token}`).digest("hex");
}

/** A short, one-way key for rate-limit buckets (never the raw address). */
export function hashedKey(kind: string, value: string | undefined): string {
  if (!value) return `${kind}:unknown`;
  return `${kind}:${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

export const SOFT_UNFINISHED_WARNING =
  "One set doesn’t look finished (sets go to 21, or 15 in a third set, won by 2). You can still save it if that’s how you played.";

export interface ScoreShape {
  /** Sets the winner needed: 1, 2 or 3. */
  readonly setsToWin: 1 | 2 | 3;
  readonly setsWon: { readonly you: number; readonly them: number };
  readonly result: "won" | "lost";
}

/**
 * The hard problem with a completed score, in words, or the score's shape.
 * Mirrors the checks `recordCompletedMatch` runs at claim.
 */
export function scoreShape(
  sets: readonly AddScoreSet[],
):
  | { readonly ok: true; readonly shape: ScoreShape }
  | { readonly ok: false; readonly problem: string } {
  if (sets.length === 0)
    return { ok: false, problem: "Add the score of at least one set." };
  if (sets.length > 5)
    return { ok: false, problem: "A match has at most five sets." };
  const winBy = standardBeachFormat.winBy;
  if (
    sets.some(
      (set) =>
        !Number.isSafeInteger(set.you) ||
        !Number.isSafeInteger(set.them) ||
        set.you < 0 ||
        set.them < 0,
    )
  ) {
    return { ok: false, problem: "Scores are whole numbers from 0." };
  }
  if (sets.some((set) => set.you === set.them)) {
    return { ok: false, problem: "A set can’t end level. Check each set." };
  }
  if (sets.some((set) => Math.abs(set.you - set.them) < winBy)) {
    return {
      ok: false,
      problem: `Every set is won by at least ${winBy} points. Check each set.`,
    };
  }
  const you = sets.filter((set) => set.you > set.them).length;
  const them = sets.length - you;
  const most = Math.max(you, them);
  if (you === them) {
    return {
      ok: false,
      problem: "The match needs a winner. Add the deciding set.",
    };
  }
  if (most > 3) {
    return { ok: false, problem: "A match is won with at most three sets." };
  }
  let runningYou = 0;
  let runningThem = 0;
  const overEarly = sets.some((set, index) => {
    if (set.you > set.them) runningYou += 1;
    else runningThem += 1;
    return (
      index < sets.length - 1 && (runningYou === most || runningThem === most)
    );
  });
  if (overEarly) {
    return {
      ok: false,
      problem:
        "The match was over before the last set. Remove the extra set or check the order.",
    };
  }
  return {
    ok: true,
    shape: {
      setsToWin: most as 1 | 2 | 3,
      setsWon: { you, them },
      result: you > them ? "won" : "lost",
    },
  };
}

/** The rating engine's own view: undefined when it would accept the sets. */
export function ratingEvidenceProblem(
  sets: readonly AddScoreSet[],
): string | undefined {
  try {
    performanceEvidenceFromSetScores(
      sets.map((set) => ({ a: set.you, b: set.them })),
    );
    return undefined;
  } catch {
    return "The rating can’t read this score. Check each set.";
  }
}

/** Soft checks: shown beside the score, never blocking. */
export function scoreWarnings(sets: readonly AddScoreSet[]): string[] {
  const shape = scoreShape(sets);
  const setsToWin = shape.ok ? shape.shape.setsToWin : 2;
  const deciding = setsToWin * 2 - 1;
  const targets = standardBeachFormat.pointTargets;
  const unfinished = sets.some((set, index) => {
    const isDecider = setsToWin > 1 && index === deciding - 1;
    const target = isDecider
      ? (targets[targets.length - 1] ?? 15)
      : (targets[0] ?? 21);
    return Math.max(set.you, set.them) < target;
  });
  return unfinished ? [SOFT_UNFINISHED_WARNING] : [];
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

/** Field errors for one step; empty when the step is complete. */
export function stepErrors(
  step: AddScoreStep,
  data: AddScoreDraftData,
  now: Date,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === "where") {
    if (!data.place)
      errors.place = "Pick where you played, or add it as a new court.";
    return errors;
  }
  if (step === "score") {
    if (!data.format) errors.format = "Choose the format.";
    if (!data.matchType) errors.matchType = "Choose competitive or friendly.";
    if (!data.playedOn) {
      errors.playedOn = "Add the day you played.";
    } else {
      // A day ahead of UTC is still today somewhere.
      if (data.playedOn > addDays(isoDay(now), 1)) {
        errors.playedOn = "That day hasn’t happened yet.";
      } else if (
        data.playedOn < addDays(isoDay(now), -ADD_SCORE_MAX_AGE_DAYS)
      ) {
        errors.playedOn = `Add matches from the last ${ADD_SCORE_MAX_AGE_DAYS} days.`;
      }
    }
    if (!data.sets?.length) {
      errors.sets = "Add the score of at least one set.";
    } else {
      const shape = scoreShape(data.sets);
      if (!shape.ok) errors.sets = shape.problem;
      else {
        const engine = ratingEvidenceProblem(data.sets);
        if (engine) errors.sets = engine;
      }
    }
    return errors;
  }
  const format = data.format ?? 2;
  const opponents = data.opponents ?? [];
  const teammates = data.teammates ?? [];
  if (opponents.length === 0) {
    errors["opponents.0.firstName"] =
      "Add at least one name from the other side.";
  }
  if (opponents.length > format) {
    errors.opponents = `A ${format} v ${format} match has ${format} players on the other side.`;
  }
  if (teammates.length > format - 1) {
    errors.teammates = `You had ${format - 1} ${format - 1 === 1 ? "partner" : "teammates"} in a ${format} v ${format} match.`;
  }
  if (data.agreed !== true) {
    errors.agreed =
      "Everyone on court needs to agree before a match is recorded.";
  }
  return errors;
}

export const ADD_SCORE_STEPS: readonly AddScoreStep[] = [
  "where",
  "score",
  "players",
];

/** The steps whose parts are complete and valid, in order. */
export function completedSteps(
  data: AddScoreDraftData,
  now: Date,
): AddScoreStep[] {
  return ADD_SCORE_STEPS.filter(
    (step) => Object.keys(stepErrors(step, data, now)).length === 0,
  );
}

/** The parts of the draft each step owns: a save replaces only these. */
export const STEP_KEYS: Readonly<
  Record<AddScoreStep, readonly (keyof AddScoreDraftData)[]>
> = {
  where: ["place"],
  score: ["format", "matchType", "playedOn", "sets"],
  players: ["you", "teammates", "opponents", "agreed"],
};

/** Merge a step's parts into the stored draft (other steps are kept). */
export function mergeStep(
  stored: AddScoreDraftData,
  step: AddScoreStep,
  incoming: AddScoreDraftData,
): AddScoreDraftData {
  const next: Record<string, unknown> = { ...stored };
  for (const key of STEP_KEYS[step]) {
    if (incoming[key] === undefined) delete next[key];
    else next[key] = incoming[key];
  }
  return next as AddScoreDraftData;
}

/** The match is rated only as competitive two-on-two (match-service rules). */
export function countsReason(
  data: Pick<AddScoreDraftData, "format" | "matchType">,
): "competitive-doubles" | "friendly" | "not-doubles" {
  if (data.matchType === "friendly") return "friendly";
  if (data.format !== 2) return "not-doubles";
  return "competitive-doubles";
}

/** Accent-free, lower-case words: the form names are compared in. */
export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(value: string): string[] {
  const compact = value.replace(/\s+/g, " ");
  const out: string[] = [];
  for (let index = 0; index < compact.length - 1; index += 1) {
    out.push(compact.slice(index, index + 2));
  }
  return out;
}

/** Words that say nothing about which court it is. */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  "the",
  "court",
  "courts",
  "beach",
  "volleyball",
  "vb",
  "sand",
  "park",
  "net",
  "nets",
  "club",
  "at",
  "of",
]);

function significantWords(name: string): string[] {
  const words = normalizePlaceName(name).split(" ").filter(Boolean);
  const significant = words.filter((word) => !GENERIC_WORDS.has(word));
  return significant.length > 0 ? significant : words;
}

/**
 * How alike two place names are, 0 to 1: the larger of the share of the
 * shorter name's significant words found in the other ("Pier" and "Pier
 * north end"), and the Dice coefficient on character pairs (typos:
 * "Dockweiler" and "Dockwieler"). Generic words ("courts", "beach") are
 * ignored unless a name has nothing else.
 */
export function nameSimilarity(left: string, right: string): number {
  const wordsA = significantWords(left);
  const wordsB = significantWords(right);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const shared = new Set(wordsA.filter((word) => setB.has(word))).size;
  const overlap = shared / Math.min(new Set(wordsA).size, setB.size);
  return Math.max(overlap, dice(wordsA.join(" "), wordsB.join(" ")));
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  const pairsA = bigrams(a);
  const pairsB = bigrams(b);
  if (pairsA.length === 0 || pairsB.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const pair of pairsA) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let shared = 0;
  for (const pair of pairsB) {
    const left = counts.get(pair) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(pair, left - 1);
    }
  }
  return (2 * shared) / (pairsA.length + pairsB.length);
}

export interface PointLike {
  readonly latitude: number;
  readonly longitude: number;
}

/** Great-circle distance in metres. */
export function distanceMeters(a: PointLike, b: PointLike): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Within this distance, and with similar names, two places are one. */
export const SAME_PLACE_RADIUS_METERS = 150;
export const SAME_PLACE_NAME_SIMILARITY = 0.6;

export interface PlaceIdentity {
  readonly googlePlaceId?: string | null;
  readonly name: string;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

/**
 * Duplicate rule (docs/design/website.md 2.5): the same provider place id,
 * or within 150 m with a similar name.
 */
export function isLikelySamePlace(a: PlaceIdentity, b: PlaceIdentity): boolean {
  if (a.googlePlaceId && b.googlePlaceId) {
    return a.googlePlaceId === b.googlePlaceId;
  }
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return false;
  }
  return (
    distanceMeters(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
    ) <= SAME_PLACE_RADIUS_METERS &&
    nameSimilarity(a.name, b.name) >= SAME_PLACE_NAME_SIMILARITY
  );
}

/** A box around a point, for an index-friendly first filter. */
export function boundingBox(point: PointLike, meters: number) {
  const latitudeDelta = meters / 111_320;
  const longitudeDelta =
    meters /
    (111_320 * Math.max(0.01, Math.cos((point.latitude * Math.PI) / 180)));
  return {
    south: point.latitude - latitudeDelta,
    north: point.latitude + latitudeDelta,
    west: point.longitude - longitudeDelta,
    east: point.longitude + longitudeDelta,
  };
}
