import type { PublicProMatchDetail, VideoSummary } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  MapPin,
  Radio,
  Sparkles,
  Tv,
  Trophy,
  Video,
} from "lucide-react";
import Link from "next/link";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type MatchTeam = PublicProMatchDetail["match"]["teamA"];

function TeamCard({
  team,
  side,
  winner,
}: {
  readonly team: MatchTeam;
  readonly side: "A" | "B";
  readonly winner: boolean;
}) {
  return (
    <article
      className={
        winner ? "pro-match-team pro-match-team--winner" : "pro-match-team"
      }
    >
      <header>
        <span>Team {side}</span>
        {winner && (
          <Badge tone="positive">
            <Trophy aria-hidden size={12} /> Winner
          </Badge>
        )}
      </header>
      <div>
        {team.players.map((player) => (
          <div key={player.personId ?? player.name}>
            {player.avatarUrl ? (
              <img alt="" src={player.avatarUrl} />
            ) : (
              <span>{player.name.slice(0, 1)}</span>
            )}
            <div>
              {player.handle ? (
                <Link href={`/players/${player.handle}`}>{player.name}</Link>
              ) : (
                <strong>{player.name}</strong>
              )}
              <small>
                {player.rating !== undefined
                  ? `SandRating ${player.rating.toFixed(2)}`
                  : "Profile mapping pending"}
              </small>
            </div>
          </div>
        ))}
      </div>
      {team.averageRating !== undefined && (
        <footer>
          Team rating <Numeric>{team.averageRating.toFixed(2)}</Numeric>
        </footer>
      )}
    </article>
  );
}

export function ProMatchDetail({
  detail,
  videos = [],
}: {
  readonly detail: PublicProMatchDetail;
  readonly videos?: readonly VideoSummary[];
}) {
  const { event, match } = detail;
  const teamAWins = match.sets.filter((set) => set.a > set.b).length;
  const teamBWins = match.sets.filter((set) => set.b > set.a).length;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${match.teamA.label} vs ${match.teamB.label}`,
    superEvent: {
      "@type": "SportsEvent",
      name: event.name,
      url: `/events/${event.slug}`,
    },
    startDate: match.playedAt,
    eventStatus:
      match.status === "completed"
        ? "https://schema.org/EventCompleted"
        : match.status === "live"
          ? "https://schema.org/EventInProgress"
          : "https://schema.org/EventScheduled",
    location: event.location
      ? { "@type": "Place", name: event.location }
      : undefined,
    sport: "Beach volleyball",
  };
  return (
    <main className="pro-match-page">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        type="application/ld+json"
      />
      <section className="pro-match-hero">
        <div>
          <Link href={`/events/${event.slug}`}>
            <ArrowLeft aria-hidden size={15} />
            {event.name}
          </Link>
          <div>
            <Badge tone={match.status === "live" ? "danger" : "neutral"}>
              {match.status === "live" && <Radio aria-hidden size={11} />}
              {match.status}
            </Badge>
            <Badge>{match.roundLabel}</Badge>
          </div>
          <h1>
            {match.teamA.label} <span>vs</span> {match.teamB.label}
          </h1>
          <p>
            Set-by-set result, mapped player profiles, and SandRating win
            prediction for {event.name}.
          </p>
          <div className="pro-match-hero__facts">
            <span>
              <CalendarDays aria-hidden size={16} />
              {match.playedAt
                ? new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(match.playedAt))
                : (event.startsOn ?? "Date pending")}
              {match.time ? ` · ${match.time}` : ""}
            </span>
            <span>
              <MapPin aria-hidden size={16} />
              {match.court ?? event.location ?? "Court pending"}
            </span>
          </div>
        </div>
        <div className="pro-match-hero__score">
          <span>{match.teamA.label}</span>
          <strong>{teamAWins}</strong>
          <i>:</i>
          <strong>{teamBWins}</strong>
          <span>{match.teamB.label}</span>
        </div>
      </section>

      <div className="pro-match-content">
        <section className="pro-match-teams">
          <TeamCard
            side="A"
            team={match.teamA}
            winner={match.winnerSide === "A"}
          />
          <TeamCard
            side="B"
            team={match.teamB}
            winner={match.winnerSide === "B"}
          />
        </section>

        <section className="pro-match-panel pro-match-sets">
          <header>
            <div>
              <span className="page-eyebrow">Set by set</span>
              <h2>
                {match.status === "completed" ? "Final score" : "Match score"}
              </h2>
            </div>
            <Trophy aria-hidden size={22} />
          </header>
          {match.sets.length > 0 ? (
            <div className="pro-match-scoreboard">
              <table>
                <caption className="sr-only">
                  Set-by-set score for {match.teamA.label} against{" "}
                  {match.teamB.label}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    {match.sets.map((_, index) => (
                      <th key={index} scope="col">
                        Set {index + 1}
                      </th>
                    ))}
                    <th scope="col">Sets won</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className={
                      match.winnerSide === "A"
                        ? "pro-match-scoreboard__winner"
                        : undefined
                    }
                  >
                    <th scope="row">
                      <strong>{match.teamA.label}</strong>
                      <small>
                        Team A{match.winnerSide === "A" ? " · Winner" : ""}
                      </small>
                    </th>
                    {match.sets.map((set, index) => (
                      <td
                        className={set.a > set.b ? "won" : undefined}
                        key={index}
                      >
                        <span>{set.a}</span>
                      </td>
                    ))}
                    <td className="pro-match-scoreboard__sets">{teamAWins}</td>
                  </tr>
                  <tr
                    className={
                      match.winnerSide === "B"
                        ? "pro-match-scoreboard__winner"
                        : undefined
                    }
                  >
                    <th scope="row">
                      <strong>{match.teamB.label}</strong>
                      <small>
                        Team B{match.winnerSide === "B" ? " · Winner" : ""}
                      </small>
                    </th>
                    {match.sets.map((set, index) => (
                      <td
                        className={set.b > set.a ? "won" : undefined}
                        key={index}
                      >
                        <span>{set.b}</span>
                      </td>
                    ))}
                    <td className="pro-match-scoreboard__sets">{teamBWins}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              The official score will appear here as soon as it is reported.
            </p>
          )}
        </section>

        <section className="pro-match-panel pro-match-prediction">
          <header>
            <div>
              <span className="page-eyebrow">Pre-match model</span>
              <h2>Winner prediction</h2>
            </div>
            <Sparkles aria-hidden size={22} />
          </header>
          <div className="pro-match-prediction__labels">
            <span>
              <strong>{match.prediction.teamA.toFixed(0)}%</strong>
              {match.teamA.label}
            </span>
            <span>
              <strong>{match.prediction.teamB.toFixed(0)}%</strong>
              {match.teamB.label}
            </span>
          </div>
          <div className="pro-match-prediction__meter">
            <span style={{ width: `${match.prediction.teamA}%` }} />
          </div>
          <p>
            {match.prediction.outcome === "upset"
              ? "Upset: the result went against the pre-match Sand Rating favorite."
              : match.prediction.outcome === "predicted"
                ? "The result matched the pre-match Sand Rating favorite."
                : match.prediction.basis === "SandRating"
                  ? "Probability is derived from the latest mapped Duna Sand Ratings. It is a forecast, not a guarantee."
                  : "Both teams currently have an even prior because mapped rating data is incomplete."}
          </p>
        </section>

        <section className="pro-match-panel pro-watch">
          <header>
            <div>
              <span className="page-eyebrow">Match broadcast</span>
              <h2>How to watch</h2>
            </div>
            <Tv aria-hidden size={22} />
          </header>
          {match.watchOptions.length > 0 ? (
            <div>
              {match.watchOptions.map((option) => {
                const content = (
                  <>
                    {option.kind === "youtube" ? (
                      <Video aria-hidden size={19} />
                    ) : (
                      <Tv aria-hidden size={19} />
                    )}
                    <span>
                      <strong>{option.label}</strong>
                      <small>
                        {option.channelName ??
                          (option.url ? "Open stream" : "Live TV")}
                      </small>
                    </span>
                    {option.url && <ExternalLink aria-hidden size={14} />}
                  </>
                );
                return option.url ? (
                  <a
                    href={option.url}
                    key={option.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {content}
                  </a>
                ) : (
                  <article key={option.id}>{content}</article>
                );
              })}
            </div>
          ) : (
            <p>
              This match uses the event broadcast guide. A match-specific link
              or TV channel will appear here when configured.
            </p>
          )}
        </section>

        {videos.length > 0 && (
          <DunaVideoGallery
            description="Choose a player-streamed angle or published replay from this match."
            title={
              videos.some((video) => video.status === "live")
                ? "Watch this match live."
                : "Match replays."
            }
            videos={videos}
          />
        )}

        <nav className="pro-match-source">
          <Link href={`/events/${event.slug}`}>
            <ArrowLeft aria-hidden size={14} />
            All event results
          </Link>
          {match.sourceUrl && (
            <a href={match.sourceUrl} rel="noreferrer" target="_blank">
              Official match source
              <ExternalLink aria-hidden size={14} />
            </a>
          )}
        </nav>
      </div>
      <SiteFooter />
    </main>
  );
}
