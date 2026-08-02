import type { MatchSummary } from "@duna/core";
import { formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function MatchCard({ match }: { readonly match: MatchSummary }) {
  return (
    <Link className="match-card" href={`/app/matches/${match.id}`}>
      <div className="match-card__date">
        <span>
          {formatVenueTime(match.playedAt, "America/Los_Angeles", "en-US", {
            month: "short",
          })}
        </span>
        <small>{match.venueName}</small>
      </div>
      <div className="match-card__teams">
        <div className={match.winner === "A" ? "winner" : undefined}>
          <span>
            {match.teamA
              .map((player) => player.displayName.split(" ")[0])
              .join(" / ")}
          </span>
          <span className="match-card__sets">
            {match.score.map(([a], index) => (
              <Numeric key={`${match.id}-a-${index}`}>{a}</Numeric>
            ))}
          </span>
        </div>
        <div className={match.winner === "B" ? "winner" : undefined}>
          <span>
            {match.teamB
              .map((player) => player.displayName.split(" ")[0])
              .join(" / ")}
          </span>
          <span className="match-card__sets">
            {match.score.map(([, b], index) => (
              <Numeric key={`${match.id}-b-${index}`}>{b}</Numeric>
            ))}
          </span>
        </div>
      </div>
      <div className="match-card__delta">
        {match.status === "pending-verification" ? (
          <Badge tone="warning">Confirm</Badge>
        ) : match.status === "disputed" ? (
          <Badge tone="warning">Held</Badge>
        ) : match.ratingImpact === "history-only" ? (
          <Badge tone="neutral">History</Badge>
        ) : (
          <Badge tone={match.ratingDelta > 0 ? "positive" : "neutral"}>
            {match.ratingDelta > 0 ? "+" : ""}
            {match.ratingDelta.toFixed(2)}
          </Badge>
        )}
        <ChevronRight aria-hidden size={17} />
      </div>
    </Link>
  );
}
