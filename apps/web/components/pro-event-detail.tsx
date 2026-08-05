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
  Ticket,
  Tv,
  Trophy,
  UsersRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { ProfessionalMatchCard } from "@/components/professional-match-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { countryFlag } from "@/lib/country-flag";
import { professionalEventJsonLd, serializeJsonLd } from "@/lib/pro-seo";

type ProMatch = PublicProEvent["matches"][number];
type ProTeam = ProMatch["teamA"];
type AvpLeague = NonNullable<PublicProEvent["avpLeague"]>;
type AvpDivisionTeam = AvpLeague["men"][number];
type AvpOverallStanding = AvpLeague["overall"][number];

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

function AvpRoster({ team }: { readonly team: AvpDivisionTeam }) {
  return (
    <span className="pro-avp-roster">
      {team.players.map((player, index) => (
        <span key={player.personId ?? player.externalPersonId}>
          {index > 0 && " / "}
          {player.handle ? (
            <Link href={`/players/${player.handle}`}>{player.name}</Link>
          ) : (
            player.name
          )}
        </span>
      ))}
    </span>
  );
}

function AvpDivisionStandings({
  label,
  teams,
}: {
  readonly label: "Men's" | "Women's";
  readonly teams: readonly AvpDivisionTeam[];
}) {
  return (
    <section className="pro-avp-table">
      <header>
        <div>
          <span>{label} division</span>
          <h3>{label} standings</h3>
        </div>
        <span>{teams.length} teams</span>
      </header>
      <div className="pro-avp-table__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">League team</th>
              <th scope="col">Record</th>
              <th scope="col">Pts</th>
              <th scope="col">Win %</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.externalTeamId}>
                <td>
                  <Numeric>{team.seed ?? "—"}</Numeric>
                </td>
                <th scope="row">
                  <strong>{team.label}</strong>
                  <AvpRoster team={team} />
                </th>
                <td>
                  <strong>{team.wins ?? 0}</strong>–{team.losses ?? 0}
                  <small>{team.matchesPlayed ?? 0} played</small>
                </td>
                <td className="pro-avp-table__points">
                  {team.matchPoints ?? team.entryPoints ?? 0}
                </td>
                <td>
                  {(team.winPercentage ?? 0).toLocaleString("en-US", {
                    maximumFractionDigits: 1,
                  })}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AvpOverallStandings({
  standings,
}: {
  readonly standings: readonly AvpOverallStanding[];
}) {
  return (
    <section className="pro-avp-table pro-avp-table--overall">
      <header>
        <div>
          <span>Combined men's + women's results</span>
          <h3>Overall team standings</h3>
        </div>
        <span>{standings.length} clubs</span>
      </header>
      <div className="pro-avp-table__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">League team</th>
              <th scope="col">Played</th>
              <th scope="col">W</th>
              <th scope="col">L</th>
              <th scope="col">Match pts</th>
              <th scope="col">Win %</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing) => (
              <tr key={standing.teamName}>
                <td>
                  <Numeric>{standing.rank}</Numeric>
                </td>
                <th scope="row">{standing.teamName}</th>
                <td>{standing.matchesPlayed}</td>
                <td>
                  <strong>{standing.wins}</strong>
                </td>
                <td>{standing.losses}</td>
                <td className="pro-avp-table__points">
                  {standing.matchPoints}
                </td>
                <td>
                  {standing.winPercentage.toLocaleString("en-US", {
                    maximumFractionDigits: 1,
                  })}
                  %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProEventDetail({ event }: { readonly event: PublicProEvent }) {
  const completedMatchCount = event.matches.filter(
    (match) => match.status === "completed",
  ).length;
  const upcomingMatches = event.matches.filter(
    (match) => match.status !== "completed",
  );
  const matchBroadcasts = event.matches.filter(
    (match) => match.watchOptions.length > 0,
  );
  const entryGroups = (
    ["main-draw", "qualification", "reserve", "withdrawn", "league"] as const
  ).flatMap((list) => {
    if (list === "league" && event.avpLeague) return [];
    const teams = event.teamEntries.filter((entry) => entry.list === list);
    return teams.length > 0 ? [{ list, teams }] : [];
  });
  const featuredMedia =
    event.editorial.media.find((media) => media.featured) ??
    event.editorial.media[0];
  const venue = event.editorial.venue;
  const structuredVenueAddress = [
    venue?.addressLine1,
    venue?.locality,
    venue?.administrativeArea,
    venue?.postalCode,
    venue?.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
  const venueAddress =
    venue?.formattedAddress ||
    structuredVenueAddress ||
    event.editorial.venueAddress;
  const venueMapParameters = new URLSearchParams();
  if (venue?.latitude !== undefined && venue.longitude !== undefined) {
    venueMapParameters.set("latitude", String(venue.latitude));
    venueMapParameters.set("longitude", String(venue.longitude));
  } else if (venueAddress) {
    venueMapParameters.set("address", venueAddress);
  }
  const venueMapHref =
    venue?.googleMapsUri ??
    (venueAddress
      ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: venueAddress }).toString()}`
      : undefined);
  const structuredData = professionalEventJsonLd(event);

  return (
    <main className="pro-event-page">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
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
              {event.editorial.venueName ??
                event.location ??
                "Location pending"}
            </span>
            <span>
              <UsersRound aria-hidden size={17} />
              {event.teamCount || event.liveStandings.length} teams
            </span>
          </div>
          {event.editorial.summary && (
            <p className="pro-event-hero__summary">{event.editorial.summary}</p>
          )}
          {venueAddress && (
            <p className="pro-event-hero__address">
              <MapPin aria-hidden size={15} />
              {venueAddress}
            </p>
          )}
          <div className="pro-event-hero__actions">
            {event.editorial.ticketUrl && (
              <a
                className="pro-event-ticket-link"
                href={event.editorial.ticketUrl}
                rel="noreferrer"
                target="_blank"
              >
                <Ticket aria-hidden size={15} /> Tickets and event access
                <ExternalLink aria-hidden size={14} />
              </a>
            )}
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
        <aside
          className={`pro-event-hero__visual${featuredMedia ? " pro-event-hero__visual--media" : ""}`}
        >
          {featuredMedia && (
            <figure>
              {featuredMedia.kind === "hero-video" ? (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster={featuredMedia.posterUrl}
                  src={featuredMedia.url}
                />
              ) : (
                <img alt={featuredMedia.alt} src={featuredMedia.url} />
              )}
              {featuredMedia.caption && (
                <figcaption>{featuredMedia.caption}</figcaption>
              )}
            </figure>
          )}
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
        </aside>
      </section>

      <div className="pro-event-content">
        {venueAddress && venueMapHref && (
          <section className="pro-event-section pro-event-venue">
            <a
              aria-label={`Open ${event.editorial.venueName ?? venueAddress} in Google Maps`}
              className="pro-event-venue__map"
              href={venueMapHref}
              rel="noreferrer"
              target="_blank"
            >
              <img
                alt={`Map showing ${event.editorial.venueName ?? venueAddress}`}
                loading="lazy"
                src={`/api/places/map?${venueMapParameters.toString()}`}
              />
              <span>
                Explore the venue <ExternalLink aria-hidden size={14} />
              </span>
            </a>
            <div className="pro-event-venue__details">
              <span className="page-eyebrow">Event location</span>
              <h2>{event.editorial.venueName ?? event.location}</h2>
              <p>{venueAddress}</p>
              {event.editorial.timezone && (
                <small>Schedule shown in {event.editorial.timezone}</small>
              )}
              <a href={venueMapHref} rel="noreferrer" target="_blank">
                Directions <ArrowRight aria-hidden size={14} />
              </a>
            </div>
          </section>
        )}
        <section className="pro-event-section pro-watch">
          <header>
            <div>
              <span className="page-eyebrow">Broadcast guide</span>
              <h2>Where to watch</h2>
            </div>
            <Tv aria-hidden size={23} />
          </header>
          {event.watchOptions.length > 0 || matchBroadcasts.length > 0 ? (
            <>
              {event.watchOptions.length > 0 && (
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
              )}
              {matchBroadcasts.length > 0 && (
                <div className="pro-watch__match-guide">
                  {matchBroadcasts.flatMap((match) =>
                    match.watchOptions.map((option) => {
                      const content = (
                        <>
                          {option.kind === "youtube" ? (
                            <Video aria-hidden size={19} />
                          ) : (
                            <Tv aria-hidden size={19} />
                          )}
                          <span>
                            <small>
                              {match.time ?? "Time pending"} · {option.label}
                            </small>
                            <strong>
                              {match.leagueTeamAName ?? match.teamA.label} vs.{" "}
                              {match.leagueTeamBName ?? match.teamB.label}
                            </strong>
                          </span>
                          <ArrowRight aria-hidden size={14} />
                        </>
                      );
                      return option.url ? (
                        <a
                          href={option.url}
                          key={`${match.id}-${option.id}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {content}
                        </a>
                      ) : (
                        <Link
                          href={match.canonicalPath}
                          key={`${match.id}-${option.id}`}
                        >
                          {content}
                        </Link>
                      );
                    }),
                  )}
                </div>
              )}
            </>
          ) : (
            <p>
              Broadcast details have not been announced yet. Duna will show
              VBTV, YouTube, or live TV coverage here as soon as it is
              confirmed.
            </p>
          )}
        </section>

        {event.avpLeague && (
          <section className="pro-event-section pro-avp-league">
            <header>
              <div>
                <span className="page-eyebrow">
                  {event.avpLeague.season} AVP League
                </span>
                <h2>Team standings</h2>
              </div>
              <Badge>{event.avpLeague.overall.length} clubs</Badge>
            </header>
            <div className="pro-avp-division-grid">
              <AvpDivisionStandings label="Men's" teams={event.avpLeague.men} />
              <AvpDivisionStandings
                label="Women's"
                teams={event.avpLeague.women}
              />
            </div>
            <AvpOverallStandings standings={event.avpLeague.overall} />
          </section>
        )}

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

        {!event.avpLeague && (
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
        )}

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

        <section
          className="pro-event-section pro-event-matches"
          id="match-results"
        >
          <header>
            <div>
              <span className="page-eyebrow">Every round</span>
              <h2>Match results</h2>
            </div>
            <Badge>{event.matches.length}</Badge>
          </header>
          <div>
            {event.matches.map((match) => (
              <ProfessionalMatchCard
                context={
                  match.leagueTeamAName && match.leagueTeamBName
                    ? `${match.leagueTeamAName} vs. ${match.leagueTeamBName}`
                    : event.name
                }
                href={match.canonicalPath}
                key={match.id}
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
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
