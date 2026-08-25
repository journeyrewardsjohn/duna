import type { MatchSummary } from "@duna/core";

export type RecentMatchPresentation = {
  readonly dateLabel: string;
  readonly matchScore: string;
  readonly opponentLabel: string;
  readonly outcome: "win" | "loss";
  readonly outcomeCode: "W" | "L";
  readonly partnerLabel?: string;
  readonly ratingDeltaLabel: string;
  readonly setScore: string;
  readonly statusLabel: string;
  readonly venueLabel: string;
};

function compactNames(
  people: MatchSummary["teamA"],
  excludedPersonId?: string,
) {
  return people
    .filter((person) => person.id !== excludedPersonId)
    .map((person) => person.displayName.split(/\s+/)[0] ?? person.displayName)
    .join(" + ");
}

function matchStatusLabel(match: MatchSummary) {
  if (match.status === "pending-verification" || match.confirmationRequired) {
    return "Pending";
  }
  if (match.status === "disputed" || match.dispute?.status === "pending") {
    return "Disputed";
  }
  if (match.status === "complete") return "Complete";
  if (match.verification === "self-reported") return "Recorded";
  return "Verified";
}

export function presentRecentMatch(
  match: MatchSummary,
  playerId: string,
  locale = "en-US",
): RecentMatchPresentation {
  const ownSide = match.teamA.some((person) => person.id === playerId)
    ? "A"
    : match.teamB.some((person) => person.id === playerId)
      ? "B"
      : match.winner;
  const ownTeam = ownSide === "A" ? match.teamA : match.teamB;
  const opponents = ownSide === "A" ? match.teamB : match.teamA;
  const won = match.winner === ownSide;
  const orientedSets = match.score.map(([teamA, teamB]) =>
    ownSide === "A" ? ([teamA, teamB] as const) : ([teamB, teamA] as const),
  );
  const setWins = orientedSets.filter(
    ([own, opponent]) => own > opponent,
  ).length;
  const setLosses = orientedSets.filter(
    ([own, opponent]) => opponent > own,
  ).length;
  const date = new Date(match.playedAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
      }).format(date);
  const delta = Number.isFinite(match.ratingDelta) ? match.ratingDelta : 0;

  return {
    dateLabel,
    matchScore: `${setWins}–${setLosses}`,
    opponentLabel: compactNames(opponents) || "Opponent",
    outcome: won ? "win" : "loss",
    outcomeCode: won ? "W" : "L",
    partnerLabel: compactNames(ownTeam, playerId) || undefined,
    ratingDeltaLabel: `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}`,
    setScore: orientedSets
      .map(([own, opponent]) => `${own}–${opponent}`)
      .join("  "),
    statusLabel: matchStatusLabel(match),
    venueLabel: match.venueName,
  };
}
