/**
 * What the result screen shows for a match (M-P4a). Pure, so every state
 * (awaiting, confirmed, disputed, expired) is tested without React.
 */
import type { MatchSummary } from "@duna/core";
import {
  netScoreState,
  parseNetScoreStatus,
  type NetScoreState,
} from "@duna/tideline-core";
import type { MatchScoring } from "./match-cache";
import {
  RESULT_STATE_COPY,
  resultState,
  waitingOn,
  whatThisResultWouldDo,
  type ResultState,
} from "./result-rules";

export type WaitingFor = "you" | "them" | "no-profile" | null;

export const WAITING_ON_YOU = "Waiting on you";
export const NO_PROFILE_YET = "Nobody on the other side has a Duna profile yet";

export interface ResultModel {
  readonly state: ResultState;
  readonly chip: string;
  readonly line: string;
  /** One Jost title, in words only. */
  readonly title: string;
  readonly names: { readonly home: string; readonly away: string };
  readonly net: NetScoreState;
  readonly mySide: "A" | "B" | null;
  /** I'm on a side that has not confirmed and I did not report it. */
  readonly needsMe: boolean;
  /** Who the result waits on: the viewer, people who can confirm, or nobody on Duna yet. */
  readonly waitingFor: WaitingFor;
  /** "Waiting on Theo or Jamie", "Waiting on you", or null. */
  readonly waiting: string | null;
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

export function resultModel(input: {
  readonly summary: MatchSummary;
  readonly scoring?: MatchScoring;
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
  // Older history has no status: a result confirmed any way other than
  // self-reporting is a confirmed result.
  const rawStatus =
    scoring?.status ??
    summary.status ??
    (summary.verification === "self-reported" ? undefined : "verified");
  const status = parseNetScoreStatus(rawStatus) ?? "complete";
  const pendingClaims =
    scoring?.participantClaims?.pending.map((claim) => claim.displayName) ?? [];
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
  // Who may confirm, as `confirmMatchResult` decides it: a signed-in
  // participant on a side that has no confirmation yet (whoever added the
  // result confirmed their own side when saving it). People added by name
  // can confirm only once they have claimed a Duna profile. Without the
  // scoring state the confirmations are unknown, so nobody is named.
  const confirmed = new Set(scoring?.confirmation.confirmedPersonIds ?? []);
  const unclaimed = new Set(
    scoring?.participantClaims?.pending.map((claim) => claim.personId) ?? [],
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
    opponents: otherSide.map((person) => first(person.displayName)),
    whatItWouldDo: whatThisResultWouldDo({
      teamSize: summary.teamSize ?? summary.teamA.length,
      matchType: summary.matchType,
    }),
    rating,
    canRemove: Boolean(summary.canRemove),
    ...(scoring?.participantClaims?.shareUrl
      ? { shareUrl: scoring.participantClaims.shareUrl }
      : {}),
    pendingClaims,
  };
}

/** A summary built from the scoring state just returned by a save. Pure. */
export function summaryFromScoring(
  scoring: MatchScoring,
  playedAt: string,
): MatchSummary {
  const person = (people: MatchScoring["teamA"]["people"][number]) => ({
    id: people.id,
    displayName: people.displayName,
    handle: "",
    initials: people.initials,
    homeMarket: "",
    roles: [] as const,
    rating: {
      display: people.ratingDisplay,
      mu: 0,
      phi: 0,
      sigma: 0,
      confidence: "Provisional" as const,
      discipline: "beach-2s" as const,
    },
  });
  const sets = scoring.score.sets.filter((set) => set.a + set.b > 0);
  return {
    id: scoring.matchId,
    status: scoring.status === "live" ? "pending-verification" : scoring.status,
    playedAt: scoring.format.playedAt ?? playedAt,
    venueName: scoring.venueName,
    teamA: scoring.teamA.people.map(person),
    teamB: scoring.teamB.people.map(person),
    score: sets.map((set) => [set.a, set.b] as const),
    winner: scoring.score.winner ?? "A",
    ratingDelta: 0,
    verification: "self-reported",
    ...(scoring.format.matchType
      ? { matchType: scoring.format.matchType }
      : {}),
    ...(scoring.format.teamSize ? { teamSize: scoring.format.teamSize } : {}),
  };
}
