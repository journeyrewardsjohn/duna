/**
 * The words and checks of adding a result (M-P4a), the same as the web
 * `/add-score` flow says them. Pure.
 *
 * MIRRORED until they move to a shared package (listed under "Needs core"
 * in the PR): the soft "doesn't look finished" check and its sentence
 * (`packages/api/src/services/add-score/rules.ts` `SOFT_UNFINISHED_WARNING`
 * and the web `SoftCheck`), the hard score checks (`scoreShape`, which
 * mirrors what `recordCompletedMatch` refuses) and "what this result would
 * do" (`apps/web/.../add-score/flow-model.ts` `resultSentence`). The test
 * file pins every sentence, so a change on one side fails here.
 */
import type { AddScorePreview, MatchSummary } from "@duna/api";

export interface EnteredSet {
  /** The person's side ("you"). */
  readonly you: number;
  readonly them: number;
}

export const SOFT_UNFINISHED_WARNING =
  "One set doesn’t look finished (sets go to 21, or 15 in a third set, won by 2). You can still save it if that’s how you played.";

/** The web's soft check: never blocks. */
export function looksUnfinished(sets: readonly EnteredSet[]): boolean {
  const won = sets.filter((set) => set.you > set.them).length;
  const most = Math.max(won, sets.length - won);
  const deciderAt = most > 1 ? most * 2 - 2 : -1;
  return sets.some(
    (set, index) =>
      Math.max(set.you, set.them) < (index === deciderAt ? 15 : 21),
  );
}

export interface ScoreShape {
  readonly setsToWin: 1 | 2 | 3;
  readonly setsWon: { readonly you: number; readonly them: number };
  readonly result: "won" | "lost";
}

const WIN_BY = 2;

/** The hard problem with a completed score, in words, or its shape. */
export function scoreShape(
  sets: readonly EnteredSet[],
):
  | { readonly ok: true; readonly shape: ScoreShape }
  | { readonly ok: false; readonly problem: string } {
  if (sets.length === 0)
    return { ok: false, problem: "Add the score of at least one set." };
  if (sets.length > 5)
    return { ok: false, problem: "A match has at most five sets." };
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
  if (sets.some((set) => Math.abs(set.you - set.them) < WIN_BY)) {
    return {
      ok: false,
      problem: `Every set is won by at least ${WIN_BY} points. Check each set.`,
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

export const AGREEMENT_LABEL = "Everyone on court agreed to record this match.";
export const AGREEMENT_REQUIRED =
  "Everyone on court needs to agree before a match is recorded.";
export const UNDER_13_MESSAGE =
  "A parent or guardian needs to add this score from their account.";

function signed(value: number): string {
  const fixed = Math.abs(value).toFixed(2);
  return value >= 0 ? `+${fixed}` : `−${fixed}`;
}

export type CountsReason = AddScorePreview["reason"];

const NOT_COUNTED: Readonly<
  Record<Exclude<CountsReason, "competitive-doubles">, string>
> = {
  friendly:
    "Nothing to your Sand Rating: friendly matches are kept in your history but don’t move it.",
  "not-doubles":
    "Nothing to your Sand Rating yet: only competitive two-on-two matches move it for now. This one is kept in your history.",
};

/** The web's `resultSentence`, word for word. */
export function resultSentence(preview: AddScorePreview): string {
  const what = preview.whatItWouldDo;
  if (!preview.counts || !what) {
    return preview.reason === "friendly"
      ? NOT_COUNTED.friendly
      : NOT_COUNTED["not-doubles"];
  }
  const verb = preview.result === "won" ? "win" : "loss";
  return `If the other side confirms it, a ${verb} like this moves a player new to Duna from ${what.startingPoint.toFixed(2)} to ${what.afterThisMatch.toFixed(2)} (${signed(what.change)}).`;
}

/** The web's line under a counting result (without the match count). */
export const MOVES_WHEN_CONFIRMED =
  "It moves only when someone on the other side confirms, and everyone in the match has a Duna profile.";

/** Why a match does or does not move a Sand Rating. Pure. */
export function countsReason(input: {
  readonly teamSize?: number;
  readonly matchType?: "competitive" | "friendly";
}): CountsReason {
  if (input.matchType === "friendly") return "friendly";
  if (input.teamSize !== undefined && input.teamSize !== 2)
    return "not-doubles";
  return "competitive-doubles";
}

/**
 * "What this result would do" for a saved match: the web's sentence when the
 * API gives a preview; otherwise, for a counting match, the web's rule about
 * when it moves (the per-match preview is under "Needs API").
 */
export function whatThisResultWouldDo(input: {
  readonly teamSize?: number;
  readonly matchType?: "competitive" | "friendly";
  readonly preview?: AddScorePreview;
}): string {
  if (input.preview) return resultSentence(input.preview);
  const reason = countsReason(input);
  return reason === "competitive-doubles"
    ? MOVES_WHEN_CONFIRMED
    : NOT_COUNTED[reason];
}

/** The four states a result is in, as a person sees them. */
export type ResultState =
  "awaiting" | "confirmed" | "disputed" | "expired" | "history";

/** Claim links for people added by name expire after 30 days (match service). */
export const CLAIM_LINK_DAYS = 30;

export function resultState(input: {
  readonly status?: MatchSummary["status"] | "live";
  readonly playedAt: string;
  readonly pendingClaims?: number;
  readonly now: Date;
}): ResultState {
  if (input.status === "disputed") return "disputed";
  if (input.status === "verified") return "confirmed";
  if (input.status === "pending-verification") {
    const age = input.now.getTime() - Date.parse(input.playedAt);
    if ((input.pendingClaims ?? 0) > 0 && age > CLAIM_LINK_DAYS * 86_400_000)
      return "expired";
    return "awaiting";
  }
  return "history";
}

export const RESULT_STATE_COPY: Readonly<
  Record<ResultState, { readonly chip: string; readonly line: string }>
> = {
  awaiting: {
    chip: "Awaiting confirmation",
    line: "Sand Ratings stay as they are until someone on the other side confirms.",
  },
  confirmed: {
    chip: "Confirmed",
    line: "Confirmed by both sides.",
  },
  disputed: {
    chip: "Disputed",
    line: "Not counted toward anyone’s Sand Rating until you agree.",
  },
  expired: {
    chip: "Claim links expired",
    line: "The links for people added by name have expired. Share a new one from the match on the web, or remove the result and add it again.",
  },
  history: {
    chip: "Recorded",
    line: "Kept in your match history.",
  },
};

/** "Waiting on Theo or Jamie" from first names. Pure. */
export function waitingOn(names: readonly string[]): string | null {
  const first = names
    .map((name) => name.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
  if (first.length === 0) return null;
  if (first.length === 1) return `Waiting on ${first[0]}`;
  return `Waiting on ${first.slice(0, -1).join(", ")} or ${first.at(-1)}`;
}

/**
 * The message a person reviews before sharing a result (they edit it and
 * the system share sheet sends it; nothing is sent for them).
 */
export function confirmationMessage(input: {
  readonly opponents: readonly string[];
  readonly link?: string;
}): string {
  const who = input.opponents
    .map((name) => name.trim().split(/\s+/)[0])
    .filter(Boolean)
    .join(" and ");
  const lead = who
    ? `I added our match on Duna, ${who}. Can you confirm the score?`
    : "I added our match on Duna. Can you confirm the score?";
  return input.link ? `${lead} ${input.link}` : lead;
}
