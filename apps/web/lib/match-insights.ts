import type { MatchSummary } from "@duna/core";

export type MatchResult = "win" | "loss" | "unknown";

export function getMatchResult(
  match: MatchSummary,
  personId: string,
): MatchResult {
  if (match.status === "pending-verification" || match.status === "disputed") {
    return "unknown";
  }
  const onTeamA = match.teamA.some((person) => person.id === personId);
  const onTeamB = match.teamB.some((person) => person.id === personId);
  if (!onTeamA && !onTeamB) return "unknown";
  return (onTeamA && match.winner === "A") || (onTeamB && match.winner === "B")
    ? "win"
    : "loss";
}

export function getMatchTeammates(match: MatchSummary, personId: string) {
  const team = match.teamA.some((person) => person.id === personId)
    ? match.teamA
    : match.teamB.some((person) => person.id === personId)
      ? match.teamB
      : [];
  return team.filter((person) => person.id !== personId);
}
