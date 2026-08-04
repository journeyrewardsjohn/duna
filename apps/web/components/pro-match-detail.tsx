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
import { ProfessionalMatchCard } from "@/components/professional-match-card";
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
  const hasScore = match.sets.length > 0;
  const teamAWins = match.sets.filter((set) => set.a > set.b).length;
  const teamBWins = match.sets.filter((set) => set.b > set.a).length;
  const scoreStatus =
    match.status === "completed"
      ? "Final"
      : match.status === "live"
        ? "Live score"
        : match.time
          ? `Starts ${match.time}`
          : "Scheduled";
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
            {match.leagueTeamAName && match.leagueTeamBName && (
              <Badge>
                {match.leagueTeamAName} vs. {match.leagueTeamBName}
              </Badge>
            )}
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
                    timeZone: match.timezone ?? "UTC",
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
        <div
          aria-label={`${match.teamA.label} ${hasScore ? teamAWins : "not started"}, ${match.teamB.label} ${hasScore ? teamBWins : "not started"}. ${scoreStatus}.`}
          aria-live={match.status === "live" ? "polite" : undefined}
          className={`pro-match-hero__score${hasScore ? "" : " pro-match-hero__score--pending"}`}
          role="group"
        >
          <span>{match.teamA.label}</span>
          <strong>{hasScore ? teamAWins : "—"}</strong>
          <i>:</i>
          <strong>{hasScore ? teamBWins : "—"}</strong>
          <span>{match.teamB.label}</span>
          <small>{scoreStatus}</small>
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

        <section className="pro-match-panel pro-match-sets" id="match-score">
          <header>
            <div>
              <span className="page-eyebrow">Set by set</span>
              <h2>
                {match.status === "completed" ? "Final score" : "Match score"}
              </h2>
            </div>
            <Trophy aria-hidden size={22} />
          </header>
          <ProfessionalMatchCard
            context={match.court ?? event.location}
            playedAt={match.playedAt}
            roundLabel={match.roundLabel}
            sets={match.sets}
            source={event.source}
            status={match.status}
            teamA={match.teamA}
            teamB={match.teamB}
            timeLabel={match.time}
            winnerSide={match.winnerSide}
          />
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
                          (option.url
                            ? "Open stream"
                            : option.kind === "youtube"
                              ? "Direct link coming soon"
                              : option.kind === "vbtv"
                                ? "VBTV subscription"
                                : "Live TV")}
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
