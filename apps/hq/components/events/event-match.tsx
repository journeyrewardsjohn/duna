import { NetScore } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { timeWords, type MatchView } from "./events-model";

/** A match's state as one of the score card's designed states. */
export function scoreStatus(match: MatchView): string {
  if (match.status === "forfeit") return "forfeit";
  if (match.status === "cancelled") return "cancelled";
  if (match.done) return "complete";
  if (match.live) return "live";
  return "scheduled";
}

/**
 * A match on the score card (Tideline NetScore, the scoreboard rows layout
 * for HQ): the teams, per-set scores, a check for the winner, Live in Solar
 * while it is on court, with where and when above and actions below.
 */
export function MatchCard({
  match,
  timeZone,
  footer,
  announce = false,
}: {
  readonly match: MatchView;
  readonly timeZone: string;
  readonly footer?: ReactNode;
  readonly announce?: boolean;
}) {
  return (
    <article
      aria-label={`${match.divisionName}, ${match.label}`}
      className="ev-match"
      data-live={match.live || undefined}
    >
      <div className="ev-match__head">
        <span>
          {match.divisionName} · {match.label}
        </span>
        <span>
          {[
            match.courtName,
            match.scheduledAt
              ? timeWords(match.scheduledAt, timeZone)
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || "Not scheduled"}
        </span>
      </div>
      <NetScore
        announce={announce}
        layout="rows"
        liveZone={false}
        sets={match.sets}
        size="sm"
        status={scoreStatus(match)}
        teams={[match.teamA ?? "To be decided", match.teamB ?? "To be decided"]}
        {...(match.winner ? { winner: match.winner } : {})}
      />
      {footer ? <div className="ev-match__foot">{footer}</div> : null}
    </article>
  );
}
