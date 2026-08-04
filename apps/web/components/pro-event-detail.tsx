import type { PublicProEvent } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ExternalLink,
  MapPin,
  Radio,
  Sparkles,
  Tv,
  Trophy,
  UsersRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { countryFlag } from "@/lib/country-flag";

type ProMatch = PublicProEvent["matches"][number];
type ProTeam = ProMatch["teamA"];

function eventDates(start?: string, end?: string) {
  if (!start) return "Dates to be announced";
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  return end && end !== start
    ? `${format(start)} – ${format(end)}`
    : format(start);
}

function TeamName({
  team,
  compact = false,
  linkPlayers = true,
}: {
  readonly team: ProTeam;
  readonly compact?: boolean;
  readonly linkPlayers?: boolean;
}) {
  return (
    <span
      className={`pro-team-name ${compact ? "pro-team-name--compact" : ""}`}
    >
      {team.players.map((player, index) => (
        <span key={`${player.personId ?? player.name}-${index}`}>
          {index > 0 && <i>/</i>}
          {player.handle && linkPlayers ? (
            <Link href={`/players/${player.handle}`}>{player.name}</Link>
          ) : (
            <span>{player.name}</span>
          )}
          {player.rating !== undefined && !compact && (
            <small>{player.rating.toFixed(2)}</small>
          )}
        </span>
      ))}
    </span>
  );
}

function SetScore({ match }: { readonly match: ProMatch }) {
  if (match.sets.length === 0) {
    return (
      <span className="pro-match-score pro-match-score--pending">TBD</span>
    );
  }
  return (
    <span className="pro-match-score">
      {match.sets.map((set, index) => (
        <span key={`${set.a}-${set.b}-${index}`}>
          {set.a}–{set.b}
        </span>
      ))}
    </span>
  );
}

function MatchRow({ match }: { readonly match: ProMatch }) {
  return (
    <Link className="pro-match-row" href={match.canonicalPath}>
      <span className="pro-match-row__round">
        {match.status === "live" && <Radio aria-hidden size={12} />}
        {match.roundLabel}
      </span>
      <span
        className={
          match.winnerSide === "A" ? "pro-match-row__winner" : undefined
        }
      >
        <TeamName compact linkPlayers={false} team={match.teamA} />
      </span>
      <SetScore match={match} />
      <span
        className={
          match.winnerSide === "B" ? "pro-match-row__winner" : undefined
        }
      >
        <TeamName compact linkPlayers={false} team={match.teamB} />
      </span>
      <ArrowRight aria-hidden size={15} />
    </Link>
  );
}

function PodiumTeam({
  team,
  place,
  label,
}: {
  readonly team: ProTeam;
  readonly place: 1 | 2 | 3;
  readonly label: string;
}) {
  return (
    <article data-place={place}>
      <span className="pro-podium__medal">{place}</span>
      <div>
        <small>{label}</small>
        <TeamName team={team} />
      </div>
    </article>
  );
}

const entryListLabels = {
  "main-draw": "Main draw teams",
  qualification: "Qualification teams",
  reserve: "Reserve teams",
  withdrawn: "Withdrawn teams",
  league: "League teams",
} as const;

export function ProEventDetail({ event }: { readonly event: PublicProEvent }) {
  const completedMatchCount = event.matches.filter(
    (match) => match.status === "completed",
  ).length;
  const upcomingMatches = event.matches.filter(
    (match) => match.status !== "completed",
  );
  const entryGroups = (
    ["main-draw", "qualification", "reserve", "withdrawn", "league"] as const
  ).flatMap((list) => {
    const teams = event.teamEntries.filter((entry) => entry.list === list);
    return teams.length > 0 ? [{ list, teams }] : [];
  });
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    startDate: event.startsOn,
    endDate: event.endsOn,
    eventStatus: event.live
      ? "https://schema.org/EventInProgress"
      : event.status === "completed"
        ? "https://schema.org/EventCompleted"
        : "https://schema.org/EventScheduled",
    location: event.location
      ? {
          "@type": "Place",
          name: event.location,
          address: event.location,
        }
      : undefined,
    sport: "Beach volleyball",
    url: `/events/${event.slug}`,
  };

  return (
    <main className="pro-event-page">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        type="application/ld+json"
      />

      <section className="pro-event-hero">
        <div className="pro-event-hero__inner">
          <Link className="pro-back-link" href="/pro">
            <ArrowLeft aria-hidden size={15} />
            Pro events
          </Link>
          <div className="pro-event-hero__badges">
            <Badge tone={event.live ? "danger" : "neutral"}>
              {event.live ? (
                <>
                  <Radio aria-hidden size={12} /> Live
                </>
              ) : (
                event.status
              )}
            </Badge>
            <Badge>{event.genderCategory}</Badge>
            <Badge>{event.category ?? "FIVB"}</Badge>
          </div>
          <h1>{event.name}</h1>
          <div className="pro-event-hero__facts">
            <span>
              <CalendarDays aria-hidden size={17} />
              {eventDates(event.startsOn, event.endsOn)}
            </span>
            <span>
              <MapPin aria-hidden size={17} />
              {event.location ?? "Location pending"}
            </span>
            <span>
              <UsersRound aria-hidden size={17} />
              {event.teamCount || event.liveStandings.length} teams
            </span>
          </div>
          <div className="pro-event-hero__actions">
            {event.sibling && (
              <Link href={`/events/${event.sibling.slug}`}>
                See {event.sibling.genderCategory}&apos;s division
                <ArrowRight aria-hidden size={15} />
              </Link>
            )}
            <a href={event.sourceUrl} rel="noreferrer" target="_blank">
              Official source
              <ExternalLink aria-hidden size={14} />
            </a>
          </div>
        </div>
        <div className="pro-event-hero__scorecard">
          <span>Live tournament desk</span>
          <strong>
            <Numeric>{completedMatchCount}</Numeric>
            <small> / {event.matchCount} matches</small>
          </strong>
          <div>
            <i
              style={{
                width: `${event.matchCount ? Math.min(100, (completedMatchCount / event.matchCount) * 100) : 0}%`,
              }}
            />
          </div>
          <small>
            Updated{" "}
            {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(event.lastSyncedAt))}
          </small>
        </div>
      </section>

      <div className="pro-event-content">
        <section className="pro-event-section pro-watch">
          <header>
            <div>
              <span className="page-eyebrow">Broadcast guide</span>
              <h2>Where to watch</h2>
            </div>
            <Tv aria-hidden size={23} />
          </header>
          {event.watchOptions.length > 0 ? (
            <div>
              {event.watchOptions.map((option) => {
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
                            : "Broadcast details confirmed")}
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
              Broadcast details have not been announced yet. Duna will show
              VBTV, YouTube, or live TV coverage here as soon as it is
              confirmed.
            </p>
          )}
        </section>

        {entryGroups.length > 0 && (
          <section className="pro-event-section pro-entry-lists">
            <header>
              <div>
                <span className="page-eyebrow">Official entry lists</span>
                <h2>Teams</h2>
              </div>
              <Badge>{event.teamEntries.length}</Badge>
            </header>
            <div className="pro-entry-lists__groups">
              {entryGroups.map((group) => (
                <section key={group.list}>
                  <header>
                    <h3>{entryListLabels[group.list]}</h3>
                    <span>{group.teams.length}</span>
                  </header>
                  <div className="pro-entry-list__head">
                    <span>Seed</span>
                    <span>Team</span>
                    <span>Country</span>
                    <span>Entry pts</span>
                    <span>Technical</span>
                  </div>
                  {group.teams.map((team) => (
                    <article
                      className={
                        group.list === "withdrawn"
                          ? "pro-entry-team pro-entry-team--withdrawn"
                          : "pro-entry-team"
                      }
                      key={`${group.list}-${team.externalTeamId}`}
                    >
                      <Numeric>{team.seed ?? "—"}</Numeric>
                      <div>
                        <strong>{team.label}</strong>
                        <span>
                          {team.players.map((player, index) => (
                            <span
                              key={player.personId ?? player.externalPersonId}
                            >
                              {index > 0 && " / "}
                              {player.handle ? (
                                <Link href={`/players/${player.handle}`}>
                                  {player.name}
                                </Link>
                              ) : (
                                player.name
                              )}
                            </span>
                          ))}
                        </span>
                      </div>
                      <span
                        aria-label={team.countryCode ?? "Country pending"}
                        className="pro-entry-team__country"
                      >
                        <b aria-hidden>{countryFlag(team.countryCode)}</b>
                        {team.countryCode ?? "—"}
                      </span>
                      <span>
                        {team.entryPoints?.toLocaleString("en-US") ?? "—"}
                      </span>
                      <span>
                        {team.entryTechnicalPoints?.toLocaleString("en-US") ??
                          "—"}
                      </span>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </section>
        )}

        {(event.podium.champion ||
          event.podium.runnerUp ||
          event.podium.thirdPlace) && (
          <section className="pro-event-section pro-podium">
            <header>
              <div>
                <span className="page-eyebrow">Final results</span>
                <h2>Podium</h2>
              </div>
              <Trophy aria-hidden size={24} />
            </header>
            <div>
              {event.podium.champion && (
                <PodiumTeam
                  label="Champion"
                  place={1}
                  team={event.podium.champion}
                />
              )}
              {event.podium.runnerUp && (
                <PodiumTeam
                  label="Runner-up"
                  place={2}
                  team={event.podium.runnerUp}
                />
              )}
              {event.podium.thirdPlace && (
                <PodiumTeam
                  label="Third place"
                  place={3}
                  team={event.podium.thirdPlace}
                />
              )}
            </div>
          </section>
        )}

        {event.bracket.length > 0 && (
          <section className="pro-event-section pro-bracket">
            <header>
              <div>
                <span className="page-eyebrow">Knockout rounds</span>
                <h2>Bracket</h2>
              </div>
              <Badge>
                {event.bracket.reduce(
                  (sum, round) => sum + round.matches.length,
                  0,
                )}{" "}
                matches
              </Badge>
            </header>
            <div className="pro-bracket__scroll">
              <div
                className="pro-bracket__rounds"
                style={{
                  gridTemplateColumns: `repeat(${event.bracket.length}, minmax(230px, 1fr))`,
                }}
              >
                {event.bracket.map((round) => (
                  <section key={round.key}>
                    <h3>{round.label}</h3>
                    <div>
                      {round.matches.map((match) => (
                        <Link href={match.canonicalPath} key={match.id}>
                          <span
                            className={
                              match.winnerSide === "A"
                                ? "pro-bracket__winner"
                                : undefined
                            }
                          >
                            <TeamName
                              compact
                              linkPlayers={false}
                              team={match.teamA}
                            />
                            <b>
                              {match.sets.filter((set) => set.a > set.b).length}
                            </b>
                          </span>
                          <span
                            className={
                              match.winnerSide === "B"
                                ? "pro-bracket__winner"
                                : undefined
                            }
                          >
                            <TeamName
                              compact
                              linkPlayers={false}
                              team={match.teamB}
                            />
                            <b>
                              {match.sets.filter((set) => set.b > set.a).length}
                            </b>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        )}

        {event.pools.length > 0 && (
          <section className="pro-event-section pro-pools">
            <header>
              <div>
                <span className="page-eyebrow">Opening stage</span>
                <h2>Pool standings</h2>
              </div>
              <Badge>{event.pools.length} pools</Badge>
            </header>
            <div className="pro-pool-grid">
              {event.pools.map((pool) => (
                <article key={pool.name}>
                  <header>
                    <h3>{pool.name}</h3>
                    <span>
                      {pool.completedMatches}/{pool.matchCount}
                    </span>
                  </header>
                  <div className="pro-standing-head">
                    <span>#</span>
                    <span>Team</span>
                    <span>W</span>
                    <span>L</span>
                    <span>Sets</span>
                  </div>
                  {pool.standings.map((standing, index) => (
                    <div className="pro-standing-row" key={standing.team.key}>
                      <b>{index + 1}</b>
                      <TeamName compact team={standing.team} />
                      <strong>{standing.wins}</strong>
                      <span>{standing.losses}</span>
                      <small>
                        {standing.setsFor}–{standing.setsAgainst}
                      </small>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="pro-event-section pro-live-table">
          <header>
            <div>
              <span className="page-eyebrow">
                {event.live ? "Updating live" : "Tournament table"}
              </span>
              <h2>{event.live ? "Live standings" : "Standings"}</h2>
            </div>
            <Activity aria-hidden size={23} />
          </header>
          <div className="pro-live-table__head">
            <span>Place</span>
            <span>Team</span>
            <span>W</span>
            <span>L</span>
            <span>Sets</span>
            <span>Points</span>
          </div>
          {event.liveStandings.slice(0, 25).map((standing, index) => (
            <div className="pro-live-table__row" key={standing.team.key}>
              <Numeric>{index + 1}</Numeric>
              <TeamName compact team={standing.team} />
              <strong>{standing.wins}</strong>
              <span>{standing.losses}</span>
              <span>
                {standing.setsFor}–{standing.setsAgainst}
              </span>
              <span>
                {standing.pointsFor}–{standing.pointsAgainst}
              </span>
            </div>
          ))}
        </section>

        {upcomingMatches.length > 0 && (
          <section className="pro-event-section pro-predictions">
            <header>
              <div>
                <span className="page-eyebrow">SandRating model</span>
                <h2>Matches + predictions</h2>
              </div>
              <Sparkles aria-hidden size={22} />
            </header>
            <div>
              {upcomingMatches.slice(0, 12).map((match) => (
                <article key={match.id}>
                  <div>
                    <small>{match.roundLabel}</small>
                    <TeamName compact team={match.teamA} />
                    <TeamName compact team={match.teamB} />
                  </div>
                  <div className="pro-prediction-meter">
                    <span style={{ width: `${match.prediction.teamA}%` }} />
                    <strong>{match.prediction.teamA.toFixed(0)}%</strong>
                    <strong>{match.prediction.teamB.toFixed(0)}%</strong>
                  </div>
                  <Link href={match.canonicalPath}>Match center</Link>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="pro-event-section pro-event-matches">
          <header>
            <div>
              <span className="page-eyebrow">Every round</span>
              <h2>Match results</h2>
            </div>
            <Badge>{event.matches.length}</Badge>
          </header>
          <div>
            {event.matches.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
