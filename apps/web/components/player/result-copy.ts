/**
 * A result in words, the same words the Player app says them
 * (`apps/player/src/features/score/result-rules.ts` and `result-model.ts`)
 * and `/add-score` says them (`app/(next)/(site)/add-score/flow-model.ts`
 * `resultSentence`, `packages/api/src/services/add-score/rules.ts`
 * `SOFT_UNFINISHED_WARNING`). Pure.
 *
 * Needs core: these sentences live in three places today (the API's add-score
 * rules, the Player app and here). `result-copy.test.ts` imports the Player
 * app's module and fails when one side changes a word; moving the table to
 * `@duna/tideline-core` (or `@duna/core`) removes the copies.
 */
import type { AddScorePreview } from "@duna/api";
import type { MatchSummary } from "@duna/core";
import {
  netScoreState,
  parseNetScoreStatus,
  type NetScoreState,
} from "@duna/tideline-core";

export interface EnteredSet {
  /** The person's side ("you"). */
  readonly you: number;
  readonly them: number;
}

export const SOFT_UNFINISHED_WARNING =
  "One set doesn’t look finished (sets go to 21, or 15 in a third set, won by 2). You can still save it if that’s how you played.";

/** The soft check: never blocks. */
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

export const NOT_COUNTED: Readonly<
  Record<Exclude<CountsReason, "competitive-doubles">, string>
> = {
  friendly:
    "Nothing to your Sand Rating: friendly matches are kept in your history but don’t move it.",
  "not-doubles":
    "Nothing to your Sand Rating yet: only competitive two-on-two matches move it for now. This one is kept in your history.",
};

/** `/add-score`'s `resultSentence`, word for word. */
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

/** The line under a counting result (without the match count). */
export const MOVES_WHEN_CONFIRMED =
  "It moves only when someone on the other side confirms, and everyone in the match has a Duna profile.";

/** Why a match does or does not move a Sand Rating. */
export function countsReason(input: {
  readonly teamSize?: number;
  readonly matchType?: "competitive" | "friendly";
}): CountsReason {
  if (input.matchType === "friendly") return "friendly";
  if (input.teamSize !== undefined && input.teamSize !== 2)
    return "not-doubles";
  return "competitive-doubles";
}

/** "What this result would do" for a saved match. */
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

/** The states a result is in, as a person sees them. */
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

/** "Waiting on Theo or Jamie" from first names. */
export function waitingOn(names: readonly string[]): string | null {
  const first = names
    .map((name) => name.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
  if (first.length === 0) return null;
  if (first.length === 1) return `Waiting on ${first[0]}`;
  return `Waiting on ${first.slice(0, -1).join(", ")} or ${first.at(-1)}`;
}

/**
 * The message a person reviews before sharing a result: they edit it and
 * send it themselves (copy, or the browser's share). Nothing is sent for them.
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

export const WAITING_ON_YOU = "Waiting on you";
export const NO_PROFILE_YET = "Nobody on the other side has a Duna profile yet";

/** After the person answers, in the app's words. */
export const CONFIRM_OUTCOME = {
  disputed: "Sent. The result doesn’t count until you agree.",
  verified: "Confirmed.",
  waiting: "Confirmed for your side. Waiting on the other side.",
  flagged:
    "Sent to Duna. It doesn’t count toward a Sand Rating while it is reviewed.",
} as const;

/** What the match service needs to answer a match (`matchScoringState`), as read. */
export interface ResultScoring {
  readonly status?: "live" | "pending-verification" | "verified" | "disputed";
  readonly confirmedPersonIds: readonly string[];
  readonly pendingClaims: readonly {
    readonly personId: string;
    readonly displayName: string;
  }[];
  readonly shareUrl?: string;
}

export type WaitingFor = "you" | "them" | "no-profile" | null;

export interface ResultModel {
  readonly state: ResultState;
  readonly chip: string;
  readonly line: string;
  /** One title, in words only. */
  readonly title: string;
  readonly names: { readonly home: string; readonly away: string };
  readonly net: NetScoreState;
  readonly mySide: "A" | "B" | null;
  /** I'm on a side that has not confirmed and I did not report it. */
  readonly needsMe: boolean;
  readonly waitingFor: WaitingFor;
  /** "Waiting on Theo or Jamie", "Waiting on you", or null. */
  readonly waiting: string | null;
  /** The people who can still confirm: only the other side, by name. */
  readonly confirmers: readonly string[];
  /** First names on the other side, for the confirm message. */
  readonly opponents: readonly string[];
  readonly whatItWouldDo: string;
  readonly rating: {
    readonly before?: number;
    readonly after?: number;
    readonly delta: number;
  } | null;
  readonly canRemove: boolean;
  readonly shareUrl?: string;
  readonly pendingClaims: readonly string[];
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** What the match page shows, from the match and (when read) its scoring state. */
export function resultModel(input: {
  readonly summary: MatchSummary;
  readonly scoring?: ResultScoring;
  readonly myId?: string;
  readonly now: Date;
}): ResultModel {
  const { summary, scoring, myId } = input;
  const names = {
    home: summary.teamA.map((person) => first(person.displayName)).join(" / "),
    away: summary.teamB.map((person) => first(person.displayName)).join(" / "),
  };
  const mySide = myId
    ? summary.teamA.some((person) => person.id === myId)
      ? "A"
      : summary.teamB.some((person) => person.id === myId)
        ? "B"
        : null
    : null;
  // Older history has no status: anything confirmed another way than
  // self-reporting is a confirmed result.
  const rawStatus =
    scoring?.status ??
    summary.status ??
    (summary.verification === "self-reported" ? undefined : "verified");
  const status = parseNetScoreStatus(rawStatus) ?? "complete";
  const pendingClaims =
    scoring?.pendingClaims.map((claim) => claim.displayName) ?? [];
  const state = resultState({
    status: rawStatus,
    playedAt: summary.playedAt,
    pendingClaims: pendingClaims.length,
    now: input.now,
  });
  const net = netScoreState({
    status,
    sets: summary.score.map(([home, away]) => ({ home, away })),
    winner: summary.winner === "A" ? "home" : "away",
    names,
  });
  // Who may confirm, as `confirmMatchResult` decides it: a signed-in player on
  // a side with no confirmation yet (whoever added the result confirmed their
  // own side). People added by name confirm only after claiming a profile.
  // Without the scoring state nobody is named.
  const confirmed = new Set(scoring?.confirmedPersonIds ?? []);
  const unclaimed = new Set(
    scoring?.pendingClaims.map((claim) => claim.personId) ?? [],
  );
  const sidePeople = (side: "A" | "B") =>
    side === "A" ? summary.teamA : summary.teamB;
  const sideConfirmed = (side: "A" | "B") =>
    sidePeople(side).some((person) => confirmed.has(person.id));
  const canSignIn = (person: MatchSummary["teamA"][number]) =>
    !unclaimed.has(person.id) &&
    person.profileClaimStatus !== "unclaimed" &&
    person.profileClaimStatus !== "claim-pending";
  const awaiting = state === "awaiting" && scoring !== undefined;
  const confirmers = awaiting
    ? (["A", "B"] as const)
        .filter((side) => !sideConfirmed(side))
        .flatMap((side) => sidePeople(side).filter(canSignIn))
    : [];
  const needsMe =
    myId !== undefined && confirmers.some((person) => person.id === myId);
  const waitingFor: WaitingFor = !awaiting
    ? null
    : needsMe
      ? "you"
      : confirmers.length > 0
        ? "them"
        : (["A", "B"] as const).some((side) => !sideConfirmed(side))
          ? "no-profile"
          : null;
  const otherSide = mySide === "B" ? summary.teamA : summary.teamB;
  const won = mySide ? summary.winner === mySide : null;
  const title =
    won === null
      ? `${summary.winner === "A" ? names.home : names.away} won`
      : won
        ? "You won"
        : "You lost";
  const copy = RESULT_STATE_COPY[state];
  const rating =
    state === "confirmed" && summary.ratingImpact !== "history-only"
      ? {
          ...(summary.ratingBefore !== undefined
            ? { before: summary.ratingBefore }
            : {}),
          ...(summary.ratingAfter !== undefined
            ? { after: summary.ratingAfter }
            : {}),
          delta: summary.ratingDelta,
        }
      : null;
  return {
    state,
    chip: copy.chip,
    line: copy.line,
    title,
    names,
    net,
    mySide,
    needsMe,
    waitingFor,
    waiting:
      waitingFor === "you"
        ? WAITING_ON_YOU
        : waitingFor === "them"
          ? waitingOn(confirmers.map((person) => person.displayName))
          : waitingFor === "no-profile"
            ? NO_PROFILE_YET
            : null,
    confirmers: confirmers
      .filter((person) => person.id !== myId)
      .map((person) => person.displayName),
    opponents: otherSide.map((person) => first(person.displayName)),
    whatItWouldDo: whatThisResultWouldDo({
      teamSize: summary.teamSize ?? summary.teamA.length,
      matchType: summary.matchType,
    }),
    rating,
    canRemove: Boolean(summary.canRemove),
    ...(scoring?.shareUrl ? { shareUrl: scoring.shareUrl } : {}),
    pendingClaims,
  };
}

/** Why a history row did or did not move the rating (the app's words). */
export function movementNote(match: MatchSummary): string | null {
  return match.status === "pending-verification"
    ? "Awaiting confirmation"
    : match.status === "disputed"
      ? "Disputed"
      : match.ratingEligibility === "held"
        ? "Held for review"
        : match.ratingImpact === "history-only"
          ? match.matchType === "friendly"
            ? "Friendly: history only"
            : "History only"
          : null;
}

/** "+0.08", "−0.04", or null when the match did not move the rating. */
export function movementChange(match: MatchSummary): string | null {
  const rated =
    match.status !== "pending-verification" &&
    match.status !== "disputed" &&
    match.ratingImpact !== "history-only" &&
    match.ratingEligibility !== "held";
  return rated && match.ratingDelta !== 0 ? signed(match.ratingDelta) : null;
}

/** The two sentences on what counts (the app's `WHAT_COUNTS`). */
export const WHAT_COUNTS = [
  "Competitive two-on-two matches move your Sand Rating once someone on the other side confirms them and everyone in the match has a Duna profile.",
  "Friendly matches, other formats and results awaiting confirmation are kept in your history without moving it.",
] as const;

/** Reliability is the engine's confidence: Provisional 1, Developing 2, else 3. */
export function reliabilityOf(
  confidence: MatchSummary["teamA"][number]["rating"]["confidence"],
): number {
  return confidence === "Provisional" ? 1 : confidence === "Developing" ? 2 : 3;
}

/**
 * The ring's props for a person: a provisional rating is never a number
 * (brand book section 4), it shows an em dash.
 */
export function ringProps(input: {
  readonly rating: MatchSummary["teamA"][number]["rating"] | undefined;
  readonly after?: number;
  readonly delta?: number;
}): {
  readonly value: number | null;
  readonly delta?: number | null;
  readonly reliability: number;
} {
  const { rating } = input;
  if (!rating || rating.confidence === "Provisional") {
    return { value: null, reliability: 1 };
  }
  return {
    value: input.after ?? rating.display,
    delta: input.delta ?? rating.delta ?? null,
    reliability: reliabilityOf(rating.confidence),
  };
}
