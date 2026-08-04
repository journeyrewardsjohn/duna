import type { MatchSummary } from "@duna/core";
import { ProfessionalMatchCard } from "@/components/professional-match-card";
import { getMatchResult } from "@/lib/match-insights";
import { compactPlayerName } from "@/lib/player-name";

function matchTour(match: MatchSummary): "fivb" | "avp" | undefined {
  const source =
    `${match.sourceUrl ?? ""} ${match.eventName ?? ""}`.toLowerCase();
  if (source.includes("avp")) return "avp";
  if (
    source.includes("fivb") ||
    source.includes("volleyball world") ||
    source.includes("beach pro tour") ||
    source.includes("elite16") ||
    source.includes("challenger") ||
    source.includes("futures")
  ) {
    return "fivb";
  }
  return undefined;
}

export function MatchCard({
  match,
  viewerId,
  variant = "default",
}: {
  readonly match: MatchSummary;
  readonly viewerId: string;
  readonly variant?: "default" | "timeline";
}) {
  const result = getMatchResult(match, viewerId);
  const resultLabel =
    result === "win" ? "Win" : result === "loss" ? "Loss" : "Unverified";
  const isLive =
    match.recordingMode === "live" &&
    match.status !== "verified" &&
    match.status !== "complete";
  const outcomeLabel =
    match.status === "pending-verification"
      ? "Confirm result"
      : match.status === "disputed"
        ? "Result held"
        : match.ratingImpact === "history-only"
          ? `${resultLabel} · History only`
          : resultLabel;
  const context = [match.eventName, match.venueName]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" · ");
  return (
    <ProfessionalMatchCard
      className={`match-card--${result}${variant === "timeline" ? " match-card--timeline" : ""}`}
      context={context}
      href={`/app/matches/${match.id}`}
      outcomeLabel={outcomeLabel}
      playedAt={match.playedAt}
      ratingDelta={
        match.ratingImpact === "history-only" ? undefined : match.ratingDelta
      }
      roundLabel={match.roundLabel ?? match.formatSummary ?? "Beach doubles"}
      sets={match.score.map(([a, b]) => ({ a, b }))}
      source={matchTour(match)}
      status={isLive ? "live" : "completed"}
      teamA={{
        label: match.teamA
          .map((player) => compactPlayerName(player.displayName))
          .join(" / "),
        players: match.teamA.map((player) => ({
          name: compactPlayerName(player.displayName),
          rating: player.rating.display,
        })),
      }}
      teamB={{
        label: match.teamB
          .map((player) => compactPlayerName(player.displayName))
          .join(" / "),
        players: match.teamB.map((player) => ({
          name: compactPlayerName(player.displayName),
          rating: player.rating.display,
        })),
      }}
      winnerSide={match.winner}
    />
  );
}
