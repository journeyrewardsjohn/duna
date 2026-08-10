import type { OperatorScorableMatch } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, MapPin, Radio, Smartphone, Trophy } from "lucide-react";
import Link from "next/link";

function timeLabel(value: string | undefined, timezone: string) {
  if (!value) return "Time pending";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function teamPeople(match: OperatorScorableMatch) {
  return [...match.teamA.people, ...match.teamB.people];
}

export function VenueMatchOperations({
  hideWhenEmpty = false,
  matches,
  timezone,
}: {
  readonly hideWhenEmpty?: boolean;
  readonly matches: readonly OperatorScorableMatch[];
  readonly timezone: string;
}) {
  const ordered = [...matches].sort((left, right) => {
    if (left.status !== right.status) return left.status === "live" ? -1 : 1;
    return (
      Date.parse(left.scheduledAt ?? "") - Date.parse(right.scheduledAt ?? "")
    );
  });
  const liveMatches = ordered.filter((match) => match.status === "live").length;
  const upcomingMatches = ordered.length - liveMatches;

  if (ordered.length === 0 && hideWhenEmpty) return null;

  if (ordered.length === 0) {
    return (
      <section className="hq-card venue-match-operations venue-match-operations--empty">
        <div className="venue-match-operations__empty">
          <span aria-hidden>
            <Trophy size={20} />
          </span>
          <div>
            <span className="hq-eyebrow">Venue match control</span>
            <h2>No matches ready to score</h2>
            <p>
              Assign both teams and a court from a session. Scoring controls
              will appear here as soon as the match is ready.
            </p>
          </div>
          <Link className="hq-button hq-button--secondary" href="/events">
            Review sessions <ArrowRight aria-hidden size={15} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="hq-card venue-match-operations">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Venue match control</span>
          <h2>Matches on your courts</h2>
          <p>
            Score live matches or open the assigned session without leaving
            today’s operating view.
          </p>
        </div>
        <div className="venue-match-operations__totals">
          {liveMatches > 0 && (
            <span data-state="live">
              <Numeric>{liveMatches}</Numeric> live now
            </span>
          )}
          {upcomingMatches > 0 && (
            <span>
              <Numeric>{upcomingMatches}</Numeric> upcoming
            </span>
          )}
        </div>
      </header>
      <div className="venue-match-operations__list">
        {ordered.map((match) => (
          <article data-state={match.status} key={match.id}>
            <div className="venue-match-operations__court">
              <span>
                <MapPin aria-hidden size={15} />{" "}
                {match.courtName ?? "Court pending"}
              </span>
              <Badge tone={match.status === "live" ? "live" : "neutral"}>
                {match.status === "live" ? "Live now" : "Scheduled"}
              </Badge>
            </div>
            <div className="venue-match-operations__identity">
              <small>{timeLabel(match.scheduledAt, timezone)}</small>
              <strong>
                {match.teamA.name} <i>vs</i> {match.teamB.name}
              </strong>
              <span>
                {[match.venueName, match.sessionTitle, match.divisionName]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div
              className="venue-match-operations__people"
              aria-label={`${teamPeople(match).length} players`}
            >
              {teamPeople(match)
                .slice(0, 4)
                .map((player, index) => (
                  <span
                    key={`${player.id}-${index}`}
                    title={player.displayName}
                  >
                    {player.initials}
                  </span>
                ))}
            </div>
            <div className="venue-match-operations__actions">
              {match.sessionId && (
                <Link href={`/events/${match.sessionId}`}>
                  Session <ArrowRight aria-hidden size={14} />
                </Link>
              )}
              <a href={`duna-pro://match/${match.id}`}>
                {match.status === "live" ? (
                  <Radio aria-hidden size={15} />
                ) : (
                  <Smartphone aria-hidden size={15} />
                )}
                {match.status === "live" ? "Resume scoring" : "Open in Pro"}
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
