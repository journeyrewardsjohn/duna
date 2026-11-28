/**
 * "What this result would do": the real rating engine run on a COPY of the
 * draft's result. Nothing here reads or writes the database; the four players
 * are synthetic, new-player ratings created in memory and thrown away.
 *
 * It is never presented as a rating. Brand book section 4: a provisional
 * rating shows an em dash; this only says what one confirmed result would
 * do for a player who is new to Duna, and how many confirmed matches it takes
 * before a Sand Rating shows. A real rating moves only through
 * `confirmMatchResult` (a player on each side confirms, nobody disputes,
 * competitive two-on-two, every player with a claimed profile).
 */
import {
  confidenceFromPhi,
  createInitialRating,
  rateDoublesMatch,
  type RatingState,
} from "@duna/rating";
import type {
  AddScoreDraftData,
  AddScorePreview,
} from "../../contracts/add-score";
import { countsReason, scoreShape, scoreWarnings } from "./rules";

/** The same weight a match confirmed by both sides gets (match-service). */
const CONFIRMED_WEIGHT = 1;
const MAX_SIMULATED_MATCHES = 40;

type Pair = readonly [{ state: RatingState }, { state: RatingState }];

function freshPair(prefix: string): Pair {
  return [
    { state: createInitialRating({ playerId: `${prefix}-1` }) },
    { state: createInitialRating({ playerId: `${prefix}-2` }) },
  ];
}

/**
 * How many confirmed matches a new player needs before the engine stops
 * calling their rating provisional (the ring shows a number). Counted by
 * running the engine itself, so it follows any change to its confidence
 * rules.
 */
export function matchesUntilRatingShows(
  sets: readonly { readonly a: number; readonly b: number }[],
): number {
  let teamA = freshPair("you");
  let teamB = freshPair("them");
  for (let played = 1; played <= MAX_SIMULATED_MATCHES; played += 1) {
    const result = rateDoublesMatch({
      teamA,
      teamB,
      setScores: sets,
      verificationWeight: CONFIRMED_WEIGHT,
    });
    const after = (id: string) =>
      result.updates.find((update) => update.playerId === id)!.after;
    if (confidenceFromPhi(after("you-1").phi) !== "Provisional") return played;
    teamA = [{ state: after("you-1") }, { state: after("you-2") }];
    teamB = [{ state: after("them-1") }, { state: after("them-2") }];
  }
  return MAX_SIMULATED_MATCHES;
}

/**
 * The preview for a draft whose score step is complete. Returns undefined
 * when the score is not a decided match (the caller says what is missing).
 */
export function previewFromDraft(
  data: AddScoreDraftData,
): AddScorePreview | undefined {
  if (!data.sets?.length || !data.format || !data.matchType) return undefined;
  const shape = scoreShape(data.sets);
  if (!shape.ok) return undefined;
  const reason = countsReason(data);
  const counts = reason === "competitive-doubles";
  const base: AddScorePreview = {
    result: shape.shape.result,
    setsWon: shape.shape.setsWon,
    counts,
    reason,
    warnings: scoreWarnings(data.sets),
  };
  if (!counts) return base;

  const setScores = data.sets.map((set) => ({ a: set.you, b: set.them }));
  const you = freshPair("you");
  const result = rateDoublesMatch({
    teamA: you,
    teamB: freshPair("them"),
    setScores,
    verificationWeight: CONFIRMED_WEIGHT,
  });
  const mine = result.updates.find((update) => update.playerId === "you-1")!;
  return {
    ...base,
    whatItWouldDo: {
      startingPoint: mine.before.display,
      afterThisMatch: mine.after.display,
      change: mine.explanation.displayDelta,
      matchesUntilShown: matchesUntilRatingShows(setScores),
    },
  };
}
