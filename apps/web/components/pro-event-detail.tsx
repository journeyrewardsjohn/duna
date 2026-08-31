import type {
  CommunityCommentSummary,
  PredictionMarketView,
  PredictionWallet,
  PublicProEvent,
} from "@duna/api";
import { googleMapsSearchUrl } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
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
import { TournamentPredictionMarkets } from "@/components/prediction-market";
import { ProfessionalMatchCard } from "@/components/professional-match-card";
import { ProEntryListBrowser } from "@/components/pro-entry-list-browser";
import { ProEventVenueCard } from "@/components/pro-event-venue-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CountryCode } from "@/components/country-code";
import { CommunityThread } from "@/components/community-thread";
import {
  EventSectionNav,
  type EventSectionNavItem,
} from "@/components/event-section-nav";
import { professionalEventJsonLd, serializeJsonLd } from "@/lib/pro-seo";

type ProMatch = PublicProEvent["matches"][number];
type ProTeam = ProMatch["teamA"];
type AvpLeague = NonNullable<PublicProEvent["avpLeague"]>;
type AvpDivisionTeam = AvpLeague["men"][number];
type AvpOverallStanding = AvpLeague["overall"][number];
type TournamentStatistics = NonNullable<PublicProEvent["tournamentStatistics"]>;

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

function eventRoundRank(label: string) {
  const normalized = label.toLowerCase();
  if (/final\s*(?:1st|first)|gold|championship|^final$/.test(normalized))
    return 8;
  if (/final\s*(?:3rd|third)|bronze|third[\s-]*place/.test(normalized))
    return 7;
  if (/semi|1\/2/.test(normalized)) return 6;
  if (/quarter|1\/4/.test(normalized)) return 5;
  if (/round\s*of\s*16|r16|1\/8/.test(normalized)) return 4;
  if (/round\s*of\s*32|r32|1\/16/.test(normalized)) return 3;
  if (/pool|group/.test(normalized)) return 2;
  if (/qualif|lucky loser/.test(normalized)) return 1;
  return 0;
}

function statisticValue(value: number | undefined, metric?: string): string {
  if (value === undefined) return "—";
  return metric === "hittingEfficiency"
    ? `${value.toFixed(1)}%`
    : value.toFixed(2);
}

const tournamentLeaderPreview = 5;
const broadcastPreview = 6;
const poolPreview = 2;
const standingPreview = 8;
const matchGroupPreview = 2;
const matchPreviewPerGroup = 4;

function DisclosureSummary({
  collapsed,
  expanded = "Show fewer",
}: {
  readonly collapsed: string;
  readonly expanded?: string;
}) {
  return (
    <summary className="pro-disclosure__summary">
      <span className="pro-disclosure__when-closed">{collapsed}</span>
      <span className="pro-disclosure__when-open">{expanded}</span>
      <ChevronDown aria-hidden size={17} />
    </summary>
  );
}

function tournamentNarrative(
  statistics: TournamentStatistics,
  insights?: PublicProEvent["tournamentInsights"],
) {
  if (insights) {
    return {
      headline: insights.headline,
      summary: insights.summary,
      findings: insights.findings,
      generatedByModel: true,
    };
  }
  const coverage = statistics.coverage;
  const lead = statistics.standouts[0];
  const findings = statistics.standouts.slice(0, 3).map((standout) => ({
    metric: standout.metric,
    title: `${standout.label}: ${standout.teamName}`,
    explanation: `${statisticValue(standout.value, standout.metric)} across ${standout.matches} ${standout.matches === 1 ? "match" : "matches"}, ${statisticValue(standout.delta, standout.metric)} above this field's current average.`,
  }));
  return {
    headline: lead
      ? `${lead.teamName} is setting the current statistical pace.`
      : "The tournament picture is still taking shape.",
    summary: `Official box scores are available for ${coverage.matchesWithStatistics} of ${coverage.totalMatches} matches. Duna is comparing every available team on the same per-set basis so early leaders are easier to read without mistaking a partial sample for a final verdict.`,
    findings,
    generatedByModel: false,
  };
}

function TournamentTeamLeaderRow({
  team,
}: {
  readonly team: TournamentStatistics["teams"][number];
}) {
  const content = (
    <>
      <strong>{team.name}</strong>
      <span>
        <Numeric tier="table">
          {statisticValue(team.hittingEfficiency, "hittingEfficiency")}
        </Numeric>
      </span>
      <span>
        <Numeric tier="table">{statisticValue(team.acesPerSet)}</Numeric>
      </span>
      <span>
        <Numeric tier="table">{statisticValue(team.blocksPerSet)}</Numeric>
      </span>
      <span>
        <Numeric tier="table">{statisticValue(team.digsPerSet)}</Numeric>
      </span>
    </>
  );
  return team.teamNo ? (
    <Link href={`/pro/teams/${team.teamNo}`}>{content}</Link>
  ) : (
    <div>{content}</div>
  );
}

function TournamentPlayerLeaderRow({
  player,
}: {
  readonly player: TournamentStatistics["players"][number];
}) {
  const content = (
    <>
      <strong>{player.name}</strong>
      <span>
        <Numeric tier="table">{player.points}</Numeric>
      </span>
      <span>
        <Numeric tier="table">
          {statisticValue(player.hittingEfficiency, "hittingEfficiency")}
        </Numeric>
      </span>
      <span>
        <Numeric tier="table">{player.aces}</Numeric>
      </span>
      <span>
        <Numeric tier="table">{player.digs}</Numeric>
      </span>
    </>
  );
  return player.publicPath ? (
    <Link href={player.publicPath}>{content}</Link>
  ) : (
    <div>{content}</div>
  );
}

function TournamentIntelligence({
  id,
  insights,
  statistics,
}: {
  readonly id?: string;
  readonly insights?: PublicProEvent["tournamentInsights"];
  readonly statistics: TournamentStatistics;
}) {
  const correlation =
    statistics.correlations.digsPerSetVsOpponentHittingEfficiency;
  const narrative = tournamentNarrative(statistics, insights);
  const correlationCopy = correlation
    ? correlation.direction === "negative"
      ? "As opponent hitting efficiency rose, recorded digs per set generally fell in this field."
      : correlation.direction === "positive"
        ? "Teams recorded more digs per set against higher-efficiency opponents in this field."
        : "Digs per set and opponent hitting efficiency have not shown a meaningful linear relationship yet."
    : "More completed matches are needed before Duna reports a stable relationship between defense and opponent attack efficiency.";
  return (
    <section className="pro-event-section pro-tournament-intelligence" id={id}>
      <header>
        <div>
          <span className="page-eyebrow">Official match analytics</span>
          <h2>Tournament pulse</h2>
        </div>
        <Badge>
          <Numeric tier="chip">
            {statistics.coverage.matchesWithStatistics}/
            {statistics.coverage.totalMatches}
          </Numeric>{" "}
          matches
        </Badge>
      </header>
      <article className="pro-tournament-intelligence__ai">
        <Sparkles aria-hidden size={21} />
        <div>
          <span>
            {narrative.generatedByModel
              ? "Duna AI tournament read"
              : "Duna tournament read"}
          </span>
          <h3>{narrative.headline}</h3>
          <p>{narrative.summary}</p>
          {narrative.findings.length > 0 && (
            <ul>
              {narrative.findings.map((finding) => (
                <li key={`${finding.metric}-${finding.title}`}>
                  <strong>{finding.title}</strong>
                  <span>{finding.explanation}</span>
                </li>
              ))}
            </ul>
          )}
          <small className="pro-tournament-intelligence__ai-source">
            {narrative.generatedByModel
              ? "AI-generated from official aggregate match statistics; no tactical cause is inferred."
              : "Evidence summary from official aggregate match statistics. A verified AI analysis appears here when one is available."}
          </small>
        </div>
      </article>
      <div className="pro-tournament-intelligence__overview">
        <div className="pro-tournament-intelligence__averages">
          <article>
            <span>Hitting efficiency</span>
            <strong>
              <Numeric tier="block">
                {statisticValue(
                  statistics.averages.hittingEfficiency,
                  "hittingEfficiency",
                )}
              </Numeric>
            </strong>
            <small>Tournament average</small>
          </article>
          <article>
            <span>Aces / set</span>
            <strong>
              <Numeric tier="block">
                {statisticValue(statistics.averages.acesPerSet)}
              </Numeric>
            </strong>
            <small>Across both sides</small>
          </article>
          <article>
            <span>Blocks / set</span>
            <strong>
              <Numeric tier="block">
                {statisticValue(statistics.averages.blocksPerSet)}
              </Numeric>
            </strong>
            <small>Across both sides</small>
          </article>
          <article>
            <span>Digs / set</span>
            <strong>
              <Numeric tier="block">
                {statisticValue(statistics.averages.digsPerSet)}
              </Numeric>
            </strong>
            <small>Successful digs</small>
          </article>
        </div>
        <aside className="pro-tournament-intelligence__correlation">
          <span>Defense context</span>
          <strong>
            {correlation ? (
              <Numeric tier="block">
                {correlation.coefficient > 0 ? "+" : ""}
                {correlation.coefficient.toFixed(2)}
              </Numeric>
            ) : (
              "Building"
            )}
          </strong>
          <p>{correlationCopy}</p>
          <small>
            {correlation
              ? `${correlation.sampleSize} team-match observations · descriptive correlation, not causation`
              : "Updates as official Elite match statistics arrive"}
          </small>
        </aside>
      </div>
      <div className="pro-tournament-intelligence__standouts">
        {statistics.standouts.map((standout) => (
          <article key={standout.metric}>
            <span>{standout.label}</span>
            <strong>{standout.teamName}</strong>
            <div>
              <b>
                <Numeric tier="block">
                  {statisticValue(standout.value, standout.metric)}
                </Numeric>
              </b>
              <small>
                <Numeric tier="chip">
                  {standout.delta >= 0 ? "+" : ""}
                  {statisticValue(standout.delta, standout.metric)}
                </Numeric>{" "}
                vs. field · <Numeric tier="chip">{standout.matches}</Numeric>{" "}
                match{standout.matches === 1 ? "" : "es"}
              </small>
            </div>
          </article>
        ))}
      </div>
      <div className="pro-tournament-intelligence__tables">
        <section>
          <header>
            <h3>Team leaders</h3>
            <span>Per-set rates</span>
          </header>
          <div className="pro-tournament-intelligence__table">
            <div className="is-head">
              <span>Team</span>
              <span>Hit eff.</span>
              <span>Aces</span>
              <span>Blocks</span>
              <span>Digs</span>
            </div>
            {statistics.teams.slice(0, tournamentLeaderPreview).map((team) => (
              <TournamentTeamLeaderRow key={team.key} team={team} />
            ))}
            {statistics.teams.length > tournamentLeaderPreview && (
              <details className="pro-disclosure pro-tournament-intelligence__table-more">
                <DisclosureSummary
                  collapsed={`See all ${statistics.teams.length} teams`}
                  expanded="Show top teams"
                />
                <div>
                  {statistics.teams
                    .slice(tournamentLeaderPreview)
                    .map((team) => (
                      <TournamentTeamLeaderRow key={team.key} team={team} />
                    ))}
                </div>
              </details>
            )}
          </div>
        </section>
        <section>
          <header>
            <h3>Player leaders</h3>
            <span>Official box scores</span>
          </header>
          <div className="pro-tournament-intelligence__table pro-tournament-intelligence__table--players">
            <div className="is-head">
              <span>Player</span>
              <span>Points</span>
              <span>Hit eff.</span>
              <span>Aces</span>
              <span>Digs</span>
            </div>
            {statistics.players
              .slice(0, tournamentLeaderPreview)
              .map((player) => (
                <TournamentPlayerLeaderRow
                  key={player.externalPlayerId}
                  player={player}
                />
              ))}
            {statistics.players.length > tournamentLeaderPreview && (
              <details className="pro-disclosure pro-tournament-intelligence__table-more">
                <DisclosureSummary
                  collapsed={`See all ${statistics.players.length} players`}
                  expanded="Show top players"
                />
                <div>
                  {statistics.players
                    .slice(tournamentLeaderPreview)
                    .map((player) => (
                      <TournamentPlayerLeaderRow
                        key={player.externalPlayerId}
                        player={player}
                      />
                    ))}
                </div>
              </details>
            )}
          </div>
        </section>
      </div>
      <footer>
        Official Volleyball World box scores. Tournament averages and leaders
        recalculate whenever a match is reconciled.
      </footer>
    </section>
  );
}

function isConfirmedTeam(team: ProTeam) {
  const placeholder = /\b(?:bye|loser|tbd|to be determined|unknown|winner)\b/i;
  return (
    team.players.length >= 2 &&
    !placeholder.test(team.label) &&
    team.players.every(
      (player) =>
        player.name.trim().length > 1 && !placeholder.test(player.name),
    )
  );
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
      {team.countryCode && (
        <CountryCode className="pro-team-name__flag" code={team.countryCode} />
      )}
      {team.players.map((player, index) => (
        <span key={`${player.personId ?? player.name}-${index}`}>
          {index > 0 && <i>/</i>}
          {(player.publicPath ?? player.handle) && linkPlayers ? (
            <Link href={player.publicPath ?? `/players/${player.handle}`}>
              {player.name}
            </Link>
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

function AvpRoster({ team }: { readonly team: AvpDivisionTeam }) {
  return (
    <span className="pro-avp-roster">
      {team.players.map((player, index) => (
        <span key={player.personId ?? player.externalPersonId}>
          {index > 0 && " / "}
          {(player.publicPath ?? player.handle) ? (
            <Link href={player.publicPath ?? `/players/${player.handle}`}>
              {player.name}
            </Link>
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
                  <Numeric tier="table">{team.seed ?? "—"}</Numeric>
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
                  <Numeric tier="table">{standing.rank}</Numeric>
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

export function ProEventDetail({
  communityAccess,
  comments = [],
  event,
  eventMarkets = [],
  matchMarkets = {},
  predictionWallet,
}: {
  readonly communityAccess?: {
    readonly verified: boolean;
    readonly paidPremium: boolean;
    readonly canComment: boolean;
    readonly reason?: string;
  };
  readonly comments?: readonly CommunityCommentSummary[];
  readonly event: PublicProEvent;
  readonly eventMarkets?: readonly PredictionMarketView[];
  readonly matchMarkets?: Readonly<Record<string, PredictionMarketView>>;
  readonly predictionWallet?: PredictionWallet;
}) {
  const completedMatchCount = event.completedMatchCount;
  const tournamentComplete = event.status === "completed" && !event.live;
  const champion = event.podium.champion;
  const runnerUp = event.podium.runnerUp;
  const topMatches = event.matches
    .filter(
      (match) =>
        match.status !== "completed" &&
        isConfirmedTeam(match.teamA) &&
        isConfirmedTeam(match.teamB),
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "live" ? -1 : 1;
      if (a.status === "live") {
        return eventRoundRank(b.roundLabel) - eventRoundRank(a.roundLabel);
      }
      const left = a.scheduledAt ? Date.parse(a.scheduledAt) : Infinity;
      const right = b.scheduledAt ? Date.parse(b.scheduledAt) : Infinity;
      return (
        left - right ||
        eventRoundRank(b.roundLabel) - eventRoundRank(a.roundLabel)
      );
    })
    .slice(0, 6);
  const matchBroadcasts = event.matches.filter(
    (match) => match.watchOptions.length > 0,
  );
  const matchBroadcastOptions = matchBroadcasts.flatMap((match) =>
    match.watchOptions.map((option) => ({ match, option })),
  );
  const browsableEntries = event.teamEntries.filter(
    (entry) => entry.list !== "league" || !event.avpLeague,
  );
  const featuredMedia =
    event.editorial.media.find((media) => media.featured) ??
    event.editorial.media[0];
  const venue = event.editorial.venue;
  const structuredVenueAddress = [
    venue?.addressLine1,
    venue?.addressLine2,
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
  const venueMapHref = venueAddress
    ? googleMapsSearchUrl({
        address: venueAddress,
        googlePlaceId: venue?.googlePlaceId,
      })
    : undefined;
  const confirmedBracket = event.bracket
    .map((round) => ({
      ...round,
      matches: round.matches.filter(
        (match) => isConfirmedTeam(match.teamA) && isConfirmedTeam(match.teamB),
      ),
    }))
    .filter((round) => round.matches.length > 0);
  const matchGroups = [
    ...new Set(event.matches.map((match) => match.roundLabel)),
  ]
    .sort((a, b) => eventRoundRank(b) - eventRoundRank(a) || a.localeCompare(b))
    .map((roundLabel) => ({
      roundLabel,
      matches: event.matches
        .filter((match) => match.roundLabel === roundLabel)
        .sort((a, b) =>
          (a.scheduledAt ?? a.playedAt ?? "").localeCompare(
            b.scheduledAt ?? b.playedAt ?? "",
          ),
        ),
    }));
  const structuredData = professionalEventJsonLd(event);
  const sectionNav: EventSectionNavItem[] = [
    { id: "event-overview", label: "Overview" },
    ...(venueAddress && venueMapHref
      ? [{ id: "event-location", label: "Location" }]
      : []),
    { id: "where-to-watch", label: "Watch" },
    ...(event.avpLeague
      ? [{ id: "league-standings", label: "League standings" }]
      : []),
    ...(browsableEntries.length ? [{ id: "event-teams", label: "Teams" }] : []),
    ...(event.tournamentStatistics
      ? [{ id: "tournament-statistics", label: "Statistics" }]
      : []),
    ...(event.status === "completed" &&
    !event.live &&
    (event.podium.champion || event.podium.runnerUp || event.podium.thirdPlace)
      ? [{ id: "event-podium", label: "Podium" }]
      : []),
    ...(confirmedBracket.length
      ? [{ id: "event-bracket", label: "Bracket" }]
      : []),
    ...(event.pools.length ? [{ id: "pool-standings", label: "Pools" }] : []),
    ...(!event.avpLeague && event.liveStandings.length
      ? [{ id: "event-standings", label: "Standings" }]
      : []),
    ...(eventMarkets.length
      ? [{ id: "prediction-markets", label: "Predictions" }]
      : []),
    ...(topMatches.length
      ? [{ id: "top-matches", label: event.live ? "Live and next" : "Next" }]
      : []),
    { id: "match-results", label: "All matches" },
  ];
  const renderBroadcastOption = ({
    match,
    option,
  }: (typeof matchBroadcastOptions)[number]) => {
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
      <Link href={match.canonicalPath} key={`${match.id}-${option.id}`}>
        {content}
      </Link>
    );
  };
  const renderPool = (pool: PublicProEvent["pools"][number]) => (
    <article key={pool.name}>
      <header>
        <h3>{pool.name}</h3>
        <span>
          <Numeric tier="chip">{pool.completedMatches}</Numeric>/
          <Numeric tier="chip">{pool.matchCount}</Numeric>
        </span>
      </header>
      <div className="pro-standing-head">
        <span>#</span>
        <span>Team</span>
        <span>W</span>
        <span>L</span>
        <span>Sets</span>
        <span aria-label="Points for" title="Points for">
          PF
        </span>
        <span aria-label="Points against" title="Points against">
          PA
        </span>
      </div>
      {pool.standings.map((standing, index) => (
        <div className="pro-standing-row" key={standing.team.key}>
          <b>
            <Numeric tier="table">{index + 1}</Numeric>
          </b>
          <TeamName compact team={standing.team} />
          <strong>
            <Numeric tier="table">{standing.wins}</Numeric>
          </strong>
          <span>
            <Numeric tier="table">{standing.losses}</Numeric>
          </span>
          <small>
            <Numeric tier="table">
              {standing.setsFor}–{standing.setsAgainst}
            </Numeric>
          </small>
          <small>
            <Numeric tier="table">{standing.pointsFor}</Numeric>
          </small>
          <small>
            <Numeric tier="table">{standing.pointsAgainst}</Numeric>
          </small>
        </div>
      ))}
    </article>
  );
  const renderLiveStanding = (
    standing: PublicProEvent["liveStandings"][number],
    index: number,
  ) => (
    <div className="pro-live-table__row" key={standing.team.key}>
      <span aria-label={`Place ${index + 1}`} className="pro-live-table__place">
        <Numeric tier="table">{standing.medal ?? index + 1}</Numeric>
      </span>
      <div className="pro-live-table__team">
        <TeamName compact team={standing.team} />
        <small>
          {standing.stageLabel} · {standing.state}
        </small>
      </div>
      <strong>
        <Numeric tier="table">{standing.wins}</Numeric>
      </strong>
      <span>
        <Numeric tier="table">{standing.losses}</Numeric>
      </span>
      <span>
        <Numeric tier="table">
          {standing.setsFor}–{standing.setsAgainst}
        </Numeric>
      </span>
      <span>
        <Numeric tier="table">
          {standing.pointsFor}–{standing.pointsAgainst}
        </Numeric>
      </span>
    </div>
  );
  const renderResultCard = (match: ProMatch) => (
    <ProfessionalMatchCard
      context={
        match.leagueTeamAName && match.leagueTeamBName
          ? `${match.leagueTeamAName} vs. ${match.leagueTeamBName}`
          : (match.court ?? event.name)
      }
      currentSetNo={match.liveScore?.currentSetNo}
      href={match.canonicalPath}
      key={match.id}
      playedAt={match.playedAt}
      predictionMarket={matchMarkets[match.id]}
      roundLabel={match.roundLabel}
      sets={match.sets}
      source={event.source}
      status={match.status}
      teamA={match.teamA}
      teamB={match.teamB}
      timeLabel={match.time}
      winnerSide={match.winnerSide}
    />
  );
  const renderMatchGroup = (group: (typeof matchGroups)[number]) => (
    <section key={group.roundLabel}>
      <header>
        <h3>{group.roundLabel}</h3>
        <span>{group.matches.length} matches</span>
      </header>
      <div>
        {group.matches.slice(0, matchPreviewPerGroup).map(renderResultCard)}
      </div>
      {group.matches.length > matchPreviewPerGroup && (
        <details className="pro-disclosure pro-match-result-group__disclosure">
          <DisclosureSummary
            collapsed={`See all ${group.matches.length} ${group.roundLabel} matches`}
            expanded={`Show fewer ${group.roundLabel} matches`}
          />
          <div className="pro-match-result-group__more">
            {group.matches.slice(matchPreviewPerGroup).map(renderResultCard)}
          </div>
        </details>
      )}
    </section>
  );

  return (
    <main className="pro-event-page" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />

      <section className="pro-event-hero" id="event-overview">
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
            <Badge>{event.category ?? "FIVB"}</Badge>
            <Badge>{event.genderCategory}</Badge>
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
          {tournamentComplete && (
            <div className="pro-event-hero__result">
              <Trophy aria-hidden size={19} />
              <div>
                <span>Final result</span>
                <strong>
                  {champion
                    ? `${champion.label} won ${event.name}`
                    : "Tournament complete"}
                </strong>
                {runnerUp && champion && (
                  <small>Defeated {runnerUp.label} in the final</small>
                )}
              </div>
              {champion && <a href="#event-podium">View podium</a>}
            </div>
          )}
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
            <span>{event.currentRound ?? "Tournament desk"}</span>
            {event.matchCount > 0 ? (
              <>
                <strong>
                  <Numeric tier="hero">{completedMatchCount}</Numeric>
                  <small> / {event.matchCount} matches</small>
                </strong>
                <div>
                  <i
                    style={{
                      width: `${Math.min(
                        100,
                        (completedMatchCount / event.matchCount) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <strong className="pro-event-hero__schedule-pending">
                Schedule connecting
              </strong>
            )}
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

      <EventSectionNav items={sectionNav} />

      <div
        className={`pro-event-content${event.live ? " pro-event-content--live" : ""}`}
      >
        {venueAddress && venueMapHref && (
          <ProEventVenueCard
            address={venueAddress}
            id="event-location"
            mapHref={venueMapHref}
            mapImageSrc={`/api/places/map?${venueMapParameters.toString()}`}
            timezone={event.editorial.timezone}
            title={event.editorial.venueName ?? event.location ?? venueAddress}
          />
        )}
        <section className="pro-event-section pro-watch" id="where-to-watch">
          <header>
            <div>
              <span className="page-eyebrow">Broadcast guide</span>
              <h2>Where to watch</h2>
            </div>
            <Tv aria-hidden size={23} />
          </header>
          {event.watchOptions.length > 0 || matchBroadcastOptions.length > 0 ? (
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
              {matchBroadcastOptions.length > 0 && (
                <>
                  <div className="pro-watch__match-guide">
                    {matchBroadcastOptions
                      .slice(0, broadcastPreview)
                      .map(renderBroadcastOption)}
                  </div>
                  {matchBroadcastOptions.length > broadcastPreview && (
                    <details className="pro-disclosure pro-watch__disclosure">
                      <DisclosureSummary
                        collapsed={`See all ${matchBroadcastOptions.length} broadcasts`}
                        expanded="Show fewer broadcasts"
                      />
                      <div className="pro-watch__match-guide pro-watch__match-guide--more">
                        {matchBroadcastOptions
                          .slice(broadcastPreview)
                          .map(renderBroadcastOption)}
                      </div>
                    </details>
                  )}
                </>
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
          <section
            className="pro-event-section pro-avp-league"
            id="league-standings"
          >
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

        {browsableEntries.length > 0 && (
          <section
            className="pro-event-section pro-entry-lists"
            id="event-teams"
          >
            <header>
              <div>
                <span className="page-eyebrow">Official entry lists</span>
                <h2>Teams</h2>
              </div>
              <Badge>{event.teamEntries.length}</Badge>
            </header>
            <ProEntryListBrowser entries={browsableEntries} />
          </section>
        )}

        {event.tournamentStatistics && (
          <TournamentIntelligence
            id="tournament-statistics"
            insights={event.tournamentInsights}
            statistics={event.tournamentStatistics}
          />
        )}

        {event.status === "completed" &&
          !event.live &&
          (event.podium.champion ||
            event.podium.runnerUp ||
            event.podium.thirdPlace) && (
            <section className="pro-event-section pro-podium" id="event-podium">
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

        {confirmedBracket.length > 0 && (
          <section className="pro-event-section pro-bracket" id="event-bracket">
            <header>
              <div>
                <span className="page-eyebrow">Knockout rounds</span>
                <h2>Bracket</h2>
              </div>
              <Badge>
                {confirmedBracket.reduce(
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
                  gridTemplateColumns: `repeat(${confirmedBracket.length}, minmax(230px, 1fr))`,
                }}
              >
                {confirmedBracket.map((round) => (
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
          <section className="pro-event-section pro-pools" id="pool-standings">
            <header>
              <div>
                <span className="page-eyebrow">Opening stage</span>
                <h2>Pool standings</h2>
              </div>
              <Badge>{event.pools.length} pools</Badge>
            </header>
            <div className="pro-pool-grid">
              {event.pools.slice(0, poolPreview).map(renderPool)}
            </div>
            {event.pools.length > poolPreview && (
              <details className="pro-disclosure pro-pool-disclosure">
                <DisclosureSummary
                  collapsed={`See all ${event.pools.length} pools`}
                  expanded="Show fewer pools"
                />
                <div className="pro-pool-grid pro-pool-grid--more">
                  {event.pools.slice(poolPreview).map(renderPool)}
                </div>
              </details>
            )}
          </section>
        )}

        {!event.avpLeague && event.liveStandings.length > 0 && (
          <section
            className="pro-event-section pro-live-table"
            data-zone={event.live ? "live" : "athletic"}
            id="event-standings"
          >
            <header>
              <div>
                <span className="page-eyebrow">
                  {event.live ? "Updating live" : "Tournament table"}
                </span>
                <h2>{event.live ? "Live standings" : "Standings"}</h2>
              </div>
              <div className="pro-live-table__status">
                <Activity aria-hidden size={23} />
              </div>
            </header>
            <div className="pro-live-table__head">
              <span>Place</span>
              <span>Team</span>
              <span>W</span>
              <span>L</span>
              <span>Sets</span>
              <span>Points</span>
            </div>
            {event.liveStandings
              .slice(0, standingPreview)
              .map(renderLiveStanding)}
            {event.liveStandings.length > standingPreview && (
              <details className="pro-disclosure pro-live-table__disclosure">
                <DisclosureSummary
                  collapsed={`See all ${event.liveStandings.length} standings`}
                  expanded="Show fewer standings"
                />
                <div>
                  {event.liveStandings
                    .slice(standingPreview)
                    .map((standing, index) =>
                      renderLiveStanding(standing, index + standingPreview),
                    )}
                </div>
              </details>
            )}
          </section>
        )}

        {eventMarkets.length > 0 && (
          <TournamentPredictionMarkets
            entries={event.winnerPrediction.entries}
            eventSlug={event.slug}
            markets={eventMarkets}
            returnTo={`/events/${event.slug}`}
            wallet={predictionWallet}
          />
        )}

        {topMatches.length > 0 && (
          <section
            className="pro-event-section pro-top-matches"
            id="top-matches"
          >
            <header>
              <div>
                <span className="page-eyebrow">
                  {event.live ? "Live now and next" : "Next on court"}
                </span>
                <h2>Top matches</h2>
              </div>
              <Sparkles aria-hidden size={22} />
            </header>
            <div className="pro-top-matches__grid">
              {topMatches.map((match) => (
                <ProfessionalMatchCard
                  className="pro-top-matches__card"
                  context={match.court ?? event.name}
                  currentSetNo={match.liveScore?.currentSetNo}
                  href={match.canonicalPath}
                  key={match.id}
                  playedAt={match.playedAt}
                  predictionMarket={matchMarkets[match.id]}
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
          <div className="pro-match-result-groups">
            {matchGroups.slice(0, matchGroupPreview).map(renderMatchGroup)}
          </div>
          {matchGroups.length > matchGroupPreview && (
            <details className="pro-disclosure pro-match-groups__disclosure">
              <DisclosureSummary
                collapsed={`See every round · ${event.matches.length} matches`}
                expanded="Show fewer rounds"
              />
              <div className="pro-match-result-groups pro-match-result-groups--more">
                {matchGroups.slice(matchGroupPreview).map(renderMatchGroup)}
              </div>
            </details>
          )}
        </section>

        <CommunityThread
          access={communityAccess}
          comments={comments}
          returnTo={`/events/${event.slug}`}
          subject={{ type: "pro-event", id: event.id }}
          title="Event conversation"
        />
      </div>
      <SiteFooter />
    </main>
  );
}
