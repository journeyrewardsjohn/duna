import type { MatchSummary } from "@duna/core";
import { getMatchResult } from "./match-insights";

export interface MatchPerformancePoint {
  readonly id: string;
  readonly playedAt: string;
  readonly value: number;
  readonly change: number;
  readonly venueName: string;
}

export interface MatchPerformanceData {
  readonly rating: {
    readonly current: number;
    readonly points: readonly MatchPerformancePoint[];
    readonly peak: number;
    readonly netMovement: number;
  };
  readonly results: {
    readonly points: readonly MatchPerformancePoint[];
    readonly wins: number;
    readonly losses: number;
    readonly lastTenRate: number;
    readonly bestStreak: number;
  };
  readonly sets: {
    readonly points: readonly MatchPerformancePoint[];
    readonly won: number;
    readonly lost: number;
    readonly lastTenRate: number;
  };
  readonly margin: {
    readonly points: readonly MatchPerformancePoint[];
    readonly average: number;
    readonly positiveMatches: number;
    readonly best: number;
  };
}

function validTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function viewerSide(match: MatchSummary, viewerId: string) {
  if (match.teamA.some((person) => person.id === viewerId)) return "A";
  if (match.teamB.some((person) => person.id === viewerId)) return "B";
  return undefined;
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

export function buildMatchPerformance(
  matches: readonly MatchSummary[],
  viewerId: string,
  currentRating: number,
): MatchPerformanceData {
  const chronological = [...matches].sort(
    (a, b) => validTimestamp(a.playedAt) - validTimestamp(b.playedAt),
  );

  const ratingPoints: MatchPerformancePoint[] = [];
  for (const match of chronological) {
    if (typeof match.ratingAfter !== "number") continue;
    const previous =
      ratingPoints.at(-1)?.value ?? match.ratingBefore ?? match.ratingAfter;
    ratingPoints.push({
      id: match.id,
      playedAt: match.playedAt,
      value: match.ratingAfter,
      change: match.ratingAfter - previous,
      venueName: match.venueName,
    });
  }

  let wins = 0;
  let losses = 0;
  let bestStreak = 0;
  let currentStreak = 0;
  let setsWon = 0;
  let setsLost = 0;
  let totalMargin = 0;
  let scoredMatches = 0;
  let positiveMatches = 0;
  let bestMargin = Number.NEGATIVE_INFINITY;
  let previousWinRate = 0;
  let previousSetRate = 0;
  let previousMargin = 0;
  const resultPoints: MatchPerformancePoint[] = [];
  const setPoints: MatchPerformancePoint[] = [];
  const marginPoints: MatchPerformancePoint[] = [];
  const verifiedMatches: Array<{
    readonly result: "win" | "loss";
    readonly setWins: number;
    readonly setLosses: number;
  }> = [];

  for (const match of chronological) {
    const side = viewerSide(match, viewerId);
    const result = getMatchResult(match, viewerId);
    if (!side || result === "unknown") continue;

    if (result === "win") {
      wins += 1;
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      losses += 1;
      currentStreak = 0;
    }

    const winRate = percentage(wins, wins + losses);
    resultPoints.push({
      id: match.id,
      playedAt: match.playedAt,
      value: winRate,
      change: winRate - previousWinRate,
      venueName: match.venueName,
    });
    previousWinRate = winRate;

    let matchSetWins = 0;
    let matchSetLosses = 0;
    let teamPoints = 0;
    let opponentPoints = 0;
    for (const [teamA, teamB] of match.score) {
      const viewerScore = side === "A" ? teamA : teamB;
      const opponentScore = side === "A" ? teamB : teamA;
      if (!Number.isFinite(viewerScore) || !Number.isFinite(opponentScore)) {
        continue;
      }
      teamPoints += viewerScore;
      opponentPoints += opponentScore;
      if (viewerScore > opponentScore) matchSetWins += 1;
      if (viewerScore < opponentScore) matchSetLosses += 1;
    }
    const scoredSets = matchSetWins + matchSetLosses;
    if (scoredSets > 0) {
      setsWon += matchSetWins;
      setsLost += matchSetLosses;
      const setRate = percentage(setsWon, setsWon + setsLost);
      setPoints.push({
        id: match.id,
        playedAt: match.playedAt,
        value: setRate,
        change: setRate - previousSetRate,
        venueName: match.venueName,
      });
      previousSetRate = setRate;

      const matchMargin = teamPoints - opponentPoints;
      totalMargin += matchMargin;
      scoredMatches += 1;
      if (matchMargin > 0) positiveMatches += 1;
      bestMargin = Math.max(bestMargin, matchMargin);
      const averageMargin = totalMargin / scoredMatches;
      marginPoints.push({
        id: match.id,
        playedAt: match.playedAt,
        value: averageMargin,
        change: averageMargin - previousMargin,
        venueName: match.venueName,
      });
      previousMargin = averageMargin;
    }
    verifiedMatches.push({
      result,
      setWins: matchSetWins,
      setLosses: matchSetLosses,
    });
  }

  const recent = verifiedMatches.slice(-10);
  const recentWins = recent.filter(({ result }) => result === "win").length;
  const recentSetsWon = recent.reduce((total, item) => total + item.setWins, 0);
  const recentSetsLost = recent.reduce(
    (total, item) => total + item.setLosses,
    0,
  );
  const firstRating = ratingPoints[0];
  const lastRating = ratingPoints.at(-1);
  const initialRating =
    chronological.find((match) => typeof match.ratingAfter === "number")
      ?.ratingBefore ??
    firstRating?.value ??
    currentRating;

  return {
    rating: {
      current: currentRating,
      points: ratingPoints,
      peak:
        ratingPoints.length === 0
          ? currentRating
          : Math.max(currentRating, ...ratingPoints.map(({ value }) => value)),
      netMovement: (lastRating?.value ?? currentRating) - initialRating,
    },
    results: {
      points: resultPoints,
      wins,
      losses,
      lastTenRate: percentage(recentWins, recent.length),
      bestStreak,
    },
    sets: {
      points: setPoints,
      won: setsWon,
      lost: setsLost,
      lastTenRate: percentage(recentSetsWon, recentSetsWon + recentSetsLost),
    },
    margin: {
      points: marginPoints,
      average: marginPoints.at(-1)?.value ?? 0,
      positiveMatches,
      best: Number.isFinite(bestMargin) ? bestMargin : 0,
    },
  };
}
