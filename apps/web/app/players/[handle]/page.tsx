import type {
  PublicPlayerIntelligence,
  PublicPlayerPerformance,
} from "@duna/api";
import { Badge, Numeric, playerAccents } from "@duna/ui";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  Flag,
  Globe2,
  GraduationCap,
  MapPin,
  Medal,
  Newspaper,
  Play,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import {
  PartnershipHistoryCard,
  type PartnershipHistory,
  type PartnershipMatchPoint,
} from "@/components/partnership-history-card";
import { PlayerFollowButton } from "@/components/player-follow-button";
import { ProStatTrendChart } from "@/components/pro-stat-trend-chart";
import {
  RatingTrendChart,
  type RatingTrendPoint,
} from "@/components/rating-trend-chart";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { CountryCode } from "@/components/country-code";
import {
  absolutePublicUrl,
  professionalOgImageUrl,
  serializeJsonLd,
} from "@/lib/pro-seo";
import {
  getProfessionalEditorialSummary,
  professionalEditorialHash,
} from "@/lib/pro-editorial";
import "./player-profile-performance.css";

type PerformanceEvent = PublicPlayerPerformance["history"][number];
type PublicParticipant = PerformanceEvent["participants"][number];
type MatchResult = "win" | "loss" | "unknown";

function matchResult(event: PerformanceEvent, personId: string): MatchResult {
  const side = event.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  if (!side || event.sets.length === 0) return "unknown";
  const setWins = event.sets.reduce(
    (record, set) => ({
      a: record.a + (set.a > set.b ? 1 : 0),
      b: record.b + (set.b > set.a ? 1 : 0),
    }),
    { a: 0, b: 0 },
  );
  if (setWins.a === setWins.b) return "unknown";
  return (setWins.a > setWins.b ? "A" : "B") === side ? "win" : "loss";
}

function predictedWinProbability(event: PerformanceEvent) {
  return (
    event.walkForwardPrediction?.winProbability ??
    event.expectedWinProbability ??
    0.5
  );
}

function formatMatchDate(value: string, compact = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: compact ? "short" : "long",
    day: "numeric",
    year: compact ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatEventDate(startsOn?: string, endsOn?: string) {
  if (!startsOn) return "Schedule coming soon";
  const starts = formatMatchDate(`${startsOn}T12:00:00Z`, true);
  if (!endsOn || endsOn === startsOn) return starts;
  return `${starts}–${formatMatchDate(`${endsOn}T12:00:00Z`, true)}`;
}

function teamName(participants: readonly PublicParticipant[], side: "A" | "B") {
  return participants
    .filter((participant) => participant.side === side)
    .map((participant) => participant.name)
    .join(" / ");
}

function matchScore(event: PerformanceEvent) {
  return event.sets.map((set) => `${set.a}–${set.b}`).join(" · ");
}

function profileStateLabel(state: string | undefined) {
  if (state === "unclaimed") return "Unclaimed profile";
  if (state === "claim-pending") return "Claim under review";
  return "Verified identity";
}

function publicSourceUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !/(^|\.)sandrating\.com$/i.test(url.hostname)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function currency(value: number, code = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function tourLabel(
  tour: PublicPlayerIntelligence["upcomingEvents"][number]["tour"],
) {
  if (tour === "avp") return "AVP";
  if (tour === "elite") return "Beach Pro Tour Elite16";
  if (tour === "challenger") return "Beach Pro Tour Challenge";
  if (tour === "futures") return "Beach Pro Tour Futures";
  return "Professional tour";
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const caller = await getServerCaller();
  const route = await caller.public
    .playerRoute({ identifier: handle })
    .catch(() => undefined);
  if (!route) return { title: "Player not found" };
  const { player } = route;
  const intelligence = await caller.public
    .playerIntelligence({ handle: player.handle })
    .catch(() => undefined);
  const description =
    intelligence?.profile?.shortBio ??
    `${player.displayName}'s Sand Rating, world ranking, verified beach volleyball results, upcoming events, partners, and performance trends.`;
  const image =
    intelligence?.profile?.heroImageUrl ??
    intelligence?.profile?.cutoutImageUrl ??
    player.avatarUrl ??
    professionalOgImageUrl({
      title: player.displayName,
      eyebrow: "Duna player profile",
      detail: `Sand Rating ${player.rating.display.toFixed(2)} · verified results · upcoming events`,
    });
  return {
    title: `${player.displayName} beach volleyball profile`,
    description,
    alternates: { canonical: route.canonicalPath },
    openGraph: {
      title: `${player.displayName} · Sand Rating ${player.rating.display.toFixed(2)}`,
      description,
      type: "profile",
      url: route.canonicalPath,
      siteName: "Duna",
      images: [
        { url: image, alt: `${player.displayName} beach volleyball profile` },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${player.displayName} · Sand Rating ${player.rating.display.toFixed(2)}`,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicPlayerPage({
  params,
}: {
  readonly params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const caller = await getServerCaller();
  const route = await caller.public
    .playerRoute({ identifier: handle })
    .catch(() => undefined);
  if (!route) notFound();
  if (route.canonicalPath !== `/players/${handle}`) {
    redirect(route.canonicalPath);
  }
  const { player } = route;
  const [performance, intelligence, videos] = await Promise.all([
    caller.public
      .playerPerformance({ handle: player.handle })
      .catch(() => undefined),
    caller.public
      .playerIntelligence({ handle: player.handle })
      .catch(() => undefined),
    caller.public.videos({ ownerHandle: player.handle }).catch(() => []),
  ]);
  const followState = await caller.player
    .playerFollowState({ playerPersonId: player.id })
    .catch(() => undefined);
  const history = performance?.history ?? [];
  const professionalStatistics = performance?.professionalStatistics;
  const results = history.map((event) => ({
    event,
    result: matchResult(event, player.id),
  }));
  const wins = results.filter(({ result }) => result === "win").length;
  const losses = results.filter(({ result }) => result === "loss").length;
  const unknown = results.length - wins - losses;
  const decided = wins + losses;
  const winRate = decided > 0 ? (wins / decided) * 100 : 0;
  const chronological = [...results].sort(
    (left, right) =>
      new Date(left.event.occurredAt).getTime() -
      new Date(right.event.occurredAt).getTime(),
  );
  const recent = chronological.slice(-10).reverse();
  const recentWins = recent.filter(({ result }) => result === "win").length;
  const earliest = chronological[0]?.event;
  const latest = chronological.at(-1)?.event;
  const netRatingChange = latest
    ? latest.afterDisplay - (earliest?.beforeDisplay ?? latest.beforeDisplay)
    : (player.rating.delta ?? 0);
  const upsetWins = results.filter(
    ({ event, result }) =>
      result === "win" && predictedWinProbability(event) < 0.5,
  );
  const biggestWin = [...upsetWins].sort(
    (left, right) =>
      predictedWinProbability(left.event) -
      predictedWinProbability(right.event),
  )[0];
  const toughestLoss = results
    .filter(({ result }) => result === "loss")
    .sort(
      (left, right) =>
        predictedWinProbability(right.event) -
        predictedWinProbability(left.event),
    )[0];
  const profileById = new Map(
    (performance?.participantProfiles ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const partnerships = new Map<
    string,
    Omit<PartnershipHistory, "history"> & {
      history: PartnershipMatchPoint[];
    }
  >();
  for (const { event, result } of results) {
    const side = event.participants.find(
      (participant) => participant.personId === player.id,
    )?.side;
    if (!side) continue;
    for (const participant of event.participants) {
      if (
        participant.side !== side ||
        !participant.personId ||
        participant.personId === player.id
      ) {
        continue;
      }
      const partner = profileById.get(participant.personId);
      if (!partner?.handle) continue;
      const existing = partnerships.get(partner.id);
      const oppositeSide = side === "A" ? "B" : "A";
      const historyPoint: PartnershipMatchPoint = {
        id: event.id,
        occurredAt: event.occurredAt,
        result,
        ratingAfter: event.afterDisplay,
        delta: event.delta,
        matchTitle: event.matchTitle,
        opponents: teamName(event.participants, oppositeSide),
        score: matchScore(event),
      };
      partnerships.set(partner.id, {
        personId: partner.id,
        publicPath: partner.publicPath,
        name: partner.displayName,
        avatarUrl: partner.avatarUrl,
        homeMarket: partner.homeMarket,
        countryCode: partner.countryCode,
        isProfessional: partner.isProfessional,
        sandRating: partner.sandRating,
        ratedMatches: partner.ratedMatches,
        matches: (existing?.matches ?? 0) + 1,
        wins: (existing?.wins ?? 0) + (result === "win" ? 1 : 0),
        losses: (existing?.losses ?? 0) + (result === "loss" ? 1 : 0),
        firstPlayedAt:
          !existing ||
          new Date(event.occurredAt) < new Date(existing.firstPlayedAt)
            ? event.occurredAt
            : existing.firstPlayedAt,
        lastPlayedAt:
          !existing ||
          new Date(event.occurredAt) > new Date(existing.lastPlayedAt)
            ? event.occurredAt
            : existing.lastPlayedAt,
        history: [...(existing?.history ?? []), historyPoint],
      });
    }
  }
  const partnershipRows: PartnershipHistory[] = [...partnerships.values()]
    .map((partnership) => ({
      ...partnership,
      history: [...partnership.history].sort(
        (left, right) =>
          new Date(left.occurredAt).getTime() -
          new Date(right.occurredAt).getTime(),
      ),
    }))
    .sort(
      (left, right) =>
        right.matches - left.matches ||
        new Date(right.lastPlayedAt).getTime() -
          new Date(left.lastPlayedAt).getTime(),
    );
  const trendPoints: RatingTrendPoint[] = chronological.map(
    ({ event, result }) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      rating: event.afterDisplay,
      before: event.beforeDisplay,
      delta: event.delta,
      result,
      matchTitle: event.matchTitle,
      partner: teamName(
        event.participants.filter(
          (participant) => participant.personId !== player.id,
        ),
        event.participants.find(
          (participant) => participant.personId === player.id,
        )?.side ?? "A",
      ),
      opponents: teamName(
        event.participants,
        event.participants.find(
          (participant) => participant.personId === player.id,
        )?.side === "A"
          ? "B"
          : "A",
      ),
      score: matchScore(event),
      matchHref: event.canonicalMatchPath,
    }),
  );
  const fallbackSummary = history.length
    ? `${player.displayName} has ${wins} verified wins and ${losses} losses across ${history.length} rated results in Duna. The connected record runs from ${formatMatchDate(earliest!.occurredAt)} through ${formatMatchDate(latest!.occurredAt)}, with a current Sand Rating of ${player.rating.display.toFixed(2)}.`
    : `${player.displayName}'s Duna profile is connected, but no approved match evidence is available yet.`;
  const editorial =
    player.isProfessional && history.length > 0
      ? await getProfessionalEditorialSummary({
          kind: "player",
          subject: player.displayName,
          facts: [
            `Current Sand Rating: ${player.rating.display.toFixed(2)} (${player.rating.discipline.replace("-", " ")}).`,
            `Verified record: ${wins} wins, ${losses} losses, ${unknown} unresolved results, across ${history.length} rated matches.`,
            `Last ten form: ${recentWins} wins in ${recent.length} decided or connected matches.`,
            `Net rating movement: ${netRatingChange >= 0 ? "+" : ""}${netRatingChange.toFixed(2)}.`,
            `Model-defined upset wins: ${upsetWins.length}.`,
            performance?.worldRanking
              ? `Latest connected world ranking: ${performance.worldRanking.rank} with ${performance.worldRanking.points.toFixed(0)} points on ${performance.worldRanking.rankingDate}.`
              : "No current world ranking is connected.",
            partnershipRows.length
              ? `Most frequent connected partners: ${partnershipRows
                  .slice(0, 3)
                  .map(
                    (row) =>
                      `${row.name} (${row.matches} matches, ${row.wins}-${row.losses})`,
                  )
                  .join("; ")}.`
              : "No resolved partnership record is available.",
          ],
          fallback: fallbackSummary,
          contentHash: professionalEditorialHash({
            playerId: player.id,
            rating: player.rating.display,
            ranking: performance?.worldRanking,
            matches: history.map((event) => [
              event.matchId,
              event.occurredAt,
              event.afterDisplay,
            ]),
          }),
        })
      : undefined;
  const enrichment = intelligence?.profile;
  const playerAccent =
    playerAccents.find((accent) => accent.id === enrichment?.accentId)?.color ??
    playerAccents[0].color;
  const countryCode =
    enrichment?.countryCode ?? performance?.worldRanking?.countryCode;
  const heroImage = enrichment?.heroImageUrl;
  const cutoutImage = enrichment?.cutoutImageUrl;
  const profileImage = cutoutImage ?? player.avatarUrl;
  const claimPath = `/app/onboarding?claimProfile=${encodeURIComponent(player.handle)}`;
  const profileUrl = absolutePublicUrl(route.canonicalPath);
  const nameParts = player.displayName.trim().split(/\s+/);
  const heroLastName = nameParts.at(-1) ?? player.displayName;
  const heroFirstName = nameParts.slice(0, -1).join(" ") || heroLastName;
  const latestConnectedResult = recent[0];
  const latestPlayerSide = latestConnectedResult?.event.participants.find(
    (participant) => participant.personId === player.id,
  )?.side;
  const latestOpponent = latestConnectedResult
    ? teamName(
        latestConnectedResult.event.participants,
        latestPlayerSide === "B" ? "A" : "B",
      )
    : undefined;
  const latestScore = latestConnectedResult?.event.sets
    .map((set) => `${set.a}–${set.b}`)
    .join(" · ");
  const nextAppearance = intelligence?.upcomingEvents[0];
  const sameAs = (enrichment?.links ?? [])
    .filter((link) => link.kind !== "news")
    .map((link) => link.url);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${profileUrl}#page`,
        url: profileUrl,
        name: `${player.displayName} beach volleyball profile`,
        description: enrichment?.shortBio ?? editorial ?? fallbackSummary,
        mainEntity: { "@id": `${profileUrl}#person` },
        breadcrumb: { "@id": `${profileUrl}#breadcrumb` },
        dateModified:
          enrichment?.publishedAt ?? latest?.occurredAt ?? undefined,
      },
      {
        "@type": "Person",
        "@id": `${profileUrl}#person`,
        name: player.displayName,
        url: profileUrl,
        image: profileImage,
        description: enrichment?.biography ?? editorial ?? fallbackSummary,
        nationality: countryCode
          ? { "@type": "Country", name: countryCode }
          : undefined,
        homeLocation:
          (enrichment?.hometown ?? player.homeMarket)
            ? {
                "@type": "Place",
                name: enrichment?.hometown ?? player.homeMarket,
              }
            : undefined,
        alumniOf: enrichment?.collegeName
          ? { "@type": "CollegeOrUniversity", name: enrichment.collegeName }
          : undefined,
        sameAs,
        knowsAbout: ["Beach volleyball", "Sand Rating"],
      },
      {
        "@type": "Dataset",
        "@id": `${profileUrl}#performance`,
        name: `${player.displayName} verified beach volleyball performance`,
        description: fallbackSummary,
        creator: { "@type": "Organization", name: "Duna" },
        measurementTechnique: "Duna Sand Rating methodology",
        temporalCoverage:
          earliest && latest
            ? `${earliest.occurredAt}/${latest.occurredAt}`
            : undefined,
        variableMeasured: [
          {
            "@type": "PropertyValue",
            name: "Sand Rating",
            value: player.rating.display,
          },
          { "@type": "PropertyValue", name: "Verified wins", value: wins },
          { "@type": "PropertyValue", name: "Verified losses", value: losses },
          { "@type": "PropertyValue", name: "Win percentage", value: winRate },
        ],
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${profileUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Duna",
            item: absolutePublicUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Rankings",
            item: absolutePublicUrl("/rankings"),
          },
          { "@type": "ListItem", position: 3, name: player.displayName },
        ],
      },
    ],
  };

  return (
    <main
      className="public-detail player-profile-v2"
      data-zone="athletic"
      style={{ "--player-accent": playerAccent } as React.CSSProperties}
    >
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />

      <section className="athlete-stage">
        <section
          className="athlete-hero"
          style={
            heroImage
              ? ({
                  "--athlete-hero-image": `url("${heroImage}")`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {enrichment?.heroVideoUrl && (
            <video
              aria-label={`${player.displayName} beach volleyball profile reel`}
              autoPlay
              className="athlete-hero__video"
              loop
              muted
              playsInline
              poster={heroImage}
              src={enrichment.heroVideoUrl}
            />
          )}
          <div className="athlete-hero__wash" />
          <span aria-hidden className="athlete-hero__surname">
            {heroLastName}
          </span>
          <div className="athlete-hero__content">
            <div className="athlete-hero__copy">
              <div className="profile-badge-row">
                {player.profileClaimStatus !== "unclaimed" && (
                  <Badge>{profileStateLabel(player.profileClaimStatus)}</Badge>
                )}
                {player.isProfessional && (
                  <Badge tone="positive">
                    <Trophy aria-hidden size={14} /> Professional
                  </Badge>
                )}
              </div>
              <p className="athlete-hero__country">
                <CountryCode code={countryCode} fallback="Beach" />
                {enrichment?.playingRole ? ` · ${enrichment.playingRole}` : ""}
              </p>
              <h1>
                <span>{heroFirstName}</span>
                <strong>{heroLastName}</strong>
              </h1>
              <p className="athlete-hero__lede">
                {enrichment?.shortBio ?? fallbackSummary}
              </p>
              <div className="athlete-hero__meta">
                <span>
                  {player.profileClaimStatus === "claimed"
                    ? `@${player.handle}`
                    : "Official tour identity"}
                </span>
                {(enrichment?.hometown ?? player.homeMarket) && (
                  <span>
                    <MapPin aria-hidden size={16} />
                    {enrichment?.hometown ?? player.homeMarket}
                  </span>
                )}
                {enrichment?.collegeName && (
                  <span>
                    {enrichment.collegeLogoUrl ? (
                      <Image
                        alt=""
                        height={22}
                        src={enrichment.collegeLogoUrl}
                        unoptimized
                        width={22}
                      />
                    ) : (
                      <GraduationCap aria-hidden size={17} />
                    )}
                    {enrichment.collegeName}
                  </span>
                )}
              </div>
              <div className="athlete-hero__actions">
                <PlayerFollowButton
                  handle={route.canonicalPath.replace("/players/", "")}
                  initialState={followState}
                  playerPersonId={player.id}
                />
                <a href="#match-history">
                  Explore results <ArrowRight aria-hidden size={17} />
                </a>
              </div>
            </div>

            <div className="athlete-hero__visual">
              <Numeric
                aria-hidden
                className="athlete-hero__rank-mark"
                tier="monument"
              >
                {performance?.worldRanking
                  ? `#${performance.worldRanking.rank}`
                  : "DUNA"}
              </Numeric>
              {profileImage ? (
                <div className="athlete-hero__portrait">
                  <Image
                    alt={enrichment?.imageAlt ?? player.displayName}
                    fill
                    priority
                    sizes="(max-width: 820px) 92vw, 42vw"
                    src={profileImage}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="athlete-hero__monogram" aria-hidden>
                  {player.initials}
                </div>
              )}
              <div className="athlete-hero__rating">
                <small>Sand Rating</small>
                <Numeric tier="hero">
                  {player.rating.display.toFixed(2)}
                </Numeric>
                <span
                  data-direction={
                    (player.rating.delta ?? 0) >= 0 ? "up" : "down"
                  }
                >
                  {history.length > 0
                    ? `${(player.rating.delta ?? 0) >= 0 ? "+" : ""}${(player.rating.delta ?? 0).toFixed(2)} current movement`
                    : "Provisional rating"}
                </span>
              </div>
            </div>

            <aside className="athlete-hero__rail">
              {latestConnectedResult ? (
                <article
                  className="athlete-hero-card athlete-hero-card--result"
                  data-result={latestConnectedResult.result}
                >
                  <header>
                    <span>Latest result</span>
                    <Badge
                      tone={
                        latestConnectedResult.result === "win"
                          ? "positive"
                          : "neutral"
                      }
                    >
                      {latestConnectedResult.result === "win"
                        ? "Win"
                        : latestConnectedResult.result === "loss"
                          ? "Loss"
                          : "Connected"}
                    </Badge>
                  </header>
                  <small>vs.</small>
                  <strong>{latestOpponent || "Opponent pending"}</strong>
                  <p>
                    {latestScore ? (
                      <Numeric tier="table">{latestScore}</Numeric>
                    ) : (
                      "Score pending"
                    )}
                  </p>
                  <footer>
                    <span>
                      {formatMatchDate(
                        latestConnectedResult.event.occurredAt,
                        true,
                      )}
                    </span>
                    <b>
                      {latestConnectedResult.event.delta >= 0 ? "+" : ""}
                      {latestConnectedResult.event.delta.toFixed(2)} rating
                    </b>
                  </footer>
                </article>
              ) : (
                <article className="athlete-hero-card athlete-hero-card--result">
                  <header>
                    <span>Latest result</span>
                    <Badge>Pending</Badge>
                  </header>
                  <strong>Match evidence is connecting.</strong>
                  <p>The profile will update as verified results arrive.</p>
                </article>
              )}

              {nextAppearance && (
                <Link
                  className="athlete-hero-card athlete-hero-card--next"
                  href={`/events/${nextAppearance.slug}`}
                  style={
                    nextAppearance.featuredMedia
                      ? {
                          backgroundImage: `linear-gradient(180deg, rgb(5 21 43 / 12%), rgb(5 21 43 / 92%)), url("${nextAppearance.featuredMedia.posterUrl ?? nextAppearance.featuredMedia.url}")`,
                        }
                      : undefined
                  }
                >
                  <span>
                    {nextAppearance.status === "live" ? "Live now" : "Next"}
                  </span>
                  <strong>{nextAppearance.name}</strong>
                  <small>
                    {formatEventDate(
                      nextAppearance.startsOn,
                      nextAppearance.endsOn,
                    )}
                  </small>
                  <b>
                    Event profile <ArrowRight aria-hidden size={15} />
                  </b>
                </Link>
              )}
            </aside>
          </div>
        </section>

        <div className="athlete-stat-deck">
          {[
            {
              label: "Sand Rating",
              value: player.rating.display.toFixed(2),
              detail:
                history.length > 0
                  ? `${netRatingChange >= 0 ? "+" : ""}${netRatingChange.toFixed(2)} across connected form`
                  : "Provisional until a rated result connects",
            },
            ...(history.length > 0
              ? [
                  {
                    label: "Verified record",
                    value: `${wins}–${losses}`,
                    detail: `${history.length} rated matches`,
                  },
                  {
                    label: "Win percentage",
                    value: `${winRate.toFixed(0)}%`,
                    detail: `${recentWins} wins in the latest ${recent.length}`,
                  },
                ]
              : [
                  {
                    label: "Rated matches",
                    value: "—",
                    detail: "First verified result pending",
                  },
                  {
                    label: "Form window",
                    value: "10",
                    detail: "Builds across the latest results",
                  },
                ]),
            {
              label: "World position",
              value: performance?.worldRanking
                ? `#${performance.worldRanking.rank}`
                : "—",
              detail: performance?.worldRanking
                ? `${performance.worldRanking.points.toFixed(0)} tour points`
                : "Ranking not connected",
            },
          ].map((metric) => (
            <article key={metric.label}>
              <small>{metric.label}</small>
              <strong>
                <Numeric tier="block">{metric.value}</Numeric>
              </strong>
              <span>{metric.detail}</span>
            </article>
          ))}
        </div>
        {player.profileClaimStatus === "unclaimed" && (
          <aside className="athlete-claim-callout">
            <div>
              <UserRoundCheck aria-hidden size={22} />
              <span>
                <small>Player identity</small>
                <strong>Is this your competition record?</strong>
                <p>
                  Claim the profile to manage your photo, biography, social
                  links, and public identity. Results and ratings stay
                  evidence-owned by Duna.
                </p>
              </span>
            </div>
            <Link href={claimPath}>
              Claim this profile <ArrowRight aria-hidden size={16} />
            </Link>
          </aside>
        )}
      </section>

      <section className="public-profile-body athlete-profile-body">
        {editorial && (
          <section className="athlete-form-report">
            <div className="athlete-form-report__mark">
              <Sparkles aria-hidden size={25} />
            </div>
            <div>
              <span className="page-eyebrow">
                Duna performance intelligence
              </span>
              <h2>The story in the results.</h2>
              <p>{editorial}</p>
              <small>
                Regenerated through Vercel AI Gateway when verified evidence
                changes.
              </small>
            </div>
            <div className="athlete-form-report__form" aria-label="Recent form">
              {recent
                .slice(0, 8)
                .reverse()
                .map(({ event, result }) => (
                  <span
                    data-result={result}
                    key={event.id}
                    title={formatMatchDate(event.occurredAt)}
                  >
                    {result === "win" ? "W" : result === "loss" ? "L" : "—"}
                  </span>
                ))}
            </div>
          </section>
        )}

        <section className="athlete-performance-grid">
          <article className="athlete-chart-card">
            <header>
              <div>
                <span className="page-eyebrow">Rating trajectory</span>
                <h2>Form, without the noise.</h2>
                <p>
                  Every movement is placed on the date the match was played.
                </p>
              </div>
              <TrendingUp aria-hidden size={26} />
            </header>
            <RatingTrendChart points={trendPoints} />
          </article>
          <aside className="athlete-insight-stack">
            <article>
              <Activity aria-hidden size={22} />
              <small>Recent form</small>
              <strong>
                {recent.length > 0 ? `${recentWins}/${recent.length}` : "—"}
              </strong>
              <span>
                {recent.length > 0
                  ? "Wins across the latest connected results"
                  : "First verified result pending"}
              </span>
            </article>
            <article>
              <Globe2 aria-hidden size={22} />
              <small>World ranking</small>
              <strong>
                {performance?.worldRanking
                  ? `#${performance.worldRanking.rank}`
                  : "Pending"}
              </strong>
              <span>
                {performance?.worldRanking
                  ? `${performance.worldRanking.points.toFixed(0)} points · ${performance.worldRanking.rankingDate}`
                  : "No current ranking connected"}
              </span>
            </article>
            <article>
              <UsersRound aria-hidden size={22} />
              <small>Most-played partner</small>
              <strong>{partnershipRows[0]?.name ?? "Pending"}</strong>
              <span>
                {partnershipRows[0]
                  ? `${partnershipRows[0].matches} connected matches`
                  : "No resolved partnership yet"}
              </span>
            </article>
          </aside>
        </section>

        {(biggestWin || toughestLoss) && (
          <section className="signature-results">
            <header>
              <div>
                <span className="page-eyebrow">Model context</span>
                <h2>Results that changed the story.</h2>
              </div>
            </header>
            <div>
              {biggestWin && (
                <SignatureResultCard
                  event={biggestWin.event}
                  icon={<TrendingUp aria-hidden size={22} />}
                  label="Biggest model upset"
                  personId={player.id}
                  tone="win"
                />
              )}
              {toughestLoss && (
                <SignatureResultCard
                  event={toughestLoss.event}
                  icon={<TrendingDown aria-hidden size={22} />}
                  label="Toughest predicted loss"
                  personId={player.id}
                  tone="loss"
                />
              )}
            </div>
          </section>
        )}

        {(intelligence?.upcomingEvents.length ?? 0) > 0 && (
          <section className="athlete-upcoming">
            <header>
              <div>
                <span className="page-eyebrow">Next on tour</span>
                <h2>Where to see {player.displayName.split(" ")[0]} next.</h2>
              </div>
              <Link href="/pro">
                Full pro tour <ArrowRight aria-hidden size={16} />
              </Link>
            </header>
            <div className="athlete-upcoming__grid">
              {intelligence!.upcomingEvents.slice(0, 4).map((event) => (
                <Link href={`/events/${event.slug}`} key={event.id}>
                  <div
                    className="athlete-upcoming__art"
                    style={
                      event.featuredMedia
                        ? {
                            backgroundImage: `url("${event.featuredMedia.posterUrl ?? event.featuredMedia.url}")`,
                          }
                        : undefined
                    }
                  >
                    <Badge
                      tone={event.status === "live" ? "positive" : "neutral"}
                    >
                      {event.status === "live" ? (
                        <Radio aria-hidden size={13} />
                      ) : (
                        <CalendarDays aria-hidden size={13} />
                      )}
                      {event.status === "live"
                        ? "Live"
                        : (event.entryStatus ?? "Registered")}
                    </Badge>
                  </div>
                  <div>
                    <small>{tourLabel(event.tour)}</small>
                    <strong>{event.name}</strong>
                    <span>{formatEventDate(event.startsOn, event.endsOn)}</span>
                    {event.location && (
                      <span>
                        <MapPin aria-hidden size={14} /> {event.location}
                      </span>
                    )}
                    {event.watchOptions.length > 0 && (
                      <span className="athlete-upcoming__watch">
                        <Play aria-hidden size={14} />{" "}
                        {event.watchOptions[0]!.label}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(enrichment?.biography ||
          Object.keys(enrichment?.careerStats ?? {}).length > 0) && (
          <section className="athlete-story-grid">
            <article className="athlete-bio-card">
              <span className="page-eyebrow">Player story</span>
              <h2>About {player.displayName}.</h2>
              <p>{enrichment?.biography ?? enrichment?.shortBio}</p>
              <div>
                {countryCode && (
                  <span>
                    <Flag aria-hidden size={17} />
                    <strong>
                      <CountryCode code={countryCode} />
                    </strong>
                    <small>Competes for</small>
                  </span>
                )}
                {enrichment?.collegeName && (
                  <span>
                    <GraduationCap aria-hidden size={17} />
                    <strong>{enrichment.collegeName}</strong>
                    <small>College</small>
                  </span>
                )}
                {enrichment?.playingRole && (
                  <span>
                    <Activity aria-hidden size={17} />
                    <strong>{enrichment.playingRole}</strong>
                    <small>Playing role</small>
                  </span>
                )}
              </div>
            </article>
            <aside className="athlete-career-card">
              <span className="page-eyebrow">Career snapshot</span>
              <div>
                {enrichment?.careerStats.events !== undefined && (
                  <article>
                    <CalendarDays aria-hidden size={18} />
                    <small>Events</small>
                    <strong>{enrichment.careerStats.events}</strong>
                  </article>
                )}
                {enrichment?.careerStats.wins !== undefined && (
                  <article>
                    <Trophy aria-hidden size={18} />
                    <small>Wins</small>
                    <strong>{enrichment.careerStats.wins}</strong>
                  </article>
                )}
                {enrichment?.careerStats.podiums !== undefined && (
                  <article>
                    <Medal aria-hidden size={18} />
                    <small>Podiums</small>
                    <strong>{enrichment.careerStats.podiums}</strong>
                  </article>
                )}
                {enrichment?.careerStats.earningsMinor !== undefined && (
                  <article>
                    <CircleDollarSign aria-hidden size={18} />
                    <small>Earnings</small>
                    <strong>
                      {currency(
                        enrichment.careerStats.earningsMinor,
                        enrichment.careerStats.earningsCurrency,
                      )}
                    </strong>
                  </article>
                )}
              </div>
              <p>
                <Sparkles aria-hidden size={15} /> {enrichment?.sourceLabel}
                {enrichment?.evidenceCount
                  ? ` · ${enrichment.evidenceCount} reviewed sources`
                  : ""}
              </p>
            </aside>
          </section>
        )}

        {videos.length > 0 && (
          <DunaVideoGallery
            description={`${player.displayName}'s public live streams, match replays, and selected beach volleyball video.`}
            eyebrow="Watch the player"
            title="Film that brings the numbers to life."
            videos={videos}
          />
        )}

        {(enrichment?.news.length ?? 0) > 0 && (
          <section className="athlete-news">
            <header>
              <div>
                <span className="page-eyebrow">In the news</span>
                <h2>Recent coverage.</h2>
              </div>
              <Newspaper aria-hidden size={25} />
            </header>
            <div>
              {enrichment!.news.slice(0, 6).map((item) => (
                <a
                  href={item.url}
                  key={item.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <small>
                    {item.publisher ?? "News"}
                    {item.publishedAt ? ` · ${item.publishedAt}` : ""}
                  </small>
                  <strong>{item.title}</strong>
                  <span>
                    Read article <ExternalLink aria-hidden size={14} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {professionalStatistics && (
          <section className="athlete-pro-statistics" id="pro-statistics">
            <header>
              <div>
                <span className="page-eyebrow">Official Elite box scores</span>
                <h2>How the game is changing.</h2>
              </div>
              <Badge>
                <Numeric tier="chip">{professionalStatistics.matches}</Numeric>{" "}
                matches
              </Badge>
            </header>
            <div className="athlete-pro-statistics__summary">
              <article>
                <span>Hitting efficiency</span>
                <strong>
                  <Numeric tier="block">
                    {professionalStatistics.hittingEfficiency?.toFixed(1) ??
                      "—"}
                    {professionalStatistics.hittingEfficiency !== undefined
                      ? "%"
                      : ""}
                  </Numeric>
                </strong>
                <small>
                  {professionalStatistics.attackPoints} kills ·{" "}
                  {professionalStatistics.attackAttempts} attacks
                </small>
              </article>
              <article>
                <span>Aces / set</span>
                <strong>
                  <Numeric tier="block">
                    {professionalStatistics.acesPerSet.toFixed(2)}
                  </Numeric>
                </strong>
                <small>{professionalStatistics.aces} total aces</small>
              </article>
              <article>
                <span>Blocks / set</span>
                <strong>
                  <Numeric tier="block">
                    {professionalStatistics.blocksPerSet.toFixed(2)}
                  </Numeric>
                </strong>
                <small>{professionalStatistics.blocks} total blocks</small>
              </article>
              <article>
                <span>Digs / set</span>
                <strong>
                  <Numeric tier="block">
                    {professionalStatistics.digsPerSet.toFixed(2)}
                  </Numeric>
                </strong>
                <small>{professionalStatistics.digs} successful digs</small>
              </article>
            </div>
            <ProStatTrendChart points={professionalStatistics.trends} />
          </section>
        )}

        {partnershipRows.length > 0 && (
          <section
            className="profile-partnerships athlete-partnerships"
            id="partnerships"
          >
            <header>
              <div>
                <span className="page-eyebrow">Partnerships</span>
                <h2>Who they&apos;ve built results with.</h2>
              </div>
              <Badge>{partnershipRows.length}</Badge>
            </header>
            <div>
              {partnershipRows.slice(0, 8).map((partner) => (
                <PartnershipHistoryCard
                  key={partner.personId}
                  partner={partner}
                />
              ))}
            </div>
          </section>
        )}

        <section
          className="public-match-history athlete-match-history"
          id="match-history"
        >
          <header>
            <div>
              <span className="page-eyebrow">Full match history</span>
              <h2>Every result behind the rating.</h2>
            </div>
            <Badge>{history.length}</Badge>
          </header>
          <div>
            {results.map(({ event, result }) => (
              <MatchHistoryCard
                event={event}
                key={event.id}
                personId={player.id}
                result={result}
              />
            ))}
            {history.length === 0 && (
              <p className="profile-empty">
                This player has no approved rating events yet.
              </p>
            )}
          </div>
        </section>

        <section className="athlete-trust-note">
          <div>
            <span className="page-eyebrow">Trust the number</span>
            <h2>Evidence first. Always.</h2>
          </div>
          <p>
            Duna stores identity mapping, source provenance, the pre-match
            forecast, actual result, score margin, and verification weight for
            every approved rating movement. Imported results are never silently
            accepted.
          </p>
          <Link href="/methodology">
            Read the methodology <ArrowRight aria-hidden size={16} />
          </Link>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}

function SignatureResultCard({
  event,
  icon,
  label,
  personId,
  tone,
}: {
  readonly event: PerformanceEvent;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly personId: string;
  readonly tone: "win" | "loss";
}) {
  const side = event.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  const opponentSide = side === "B" ? "A" : "B";
  return (
    <article data-tone={tone}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{teamName(event.participants, opponentSide)}</strong>
        <p>{event.sets.map((set) => `${set.a}–${set.b}`).join(" · ")}</p>
      </div>
      <div>
        <Numeric tier="block">
          {(predictedWinProbability(event) * 100).toFixed(0)}%
        </Numeric>
        <small>pre-match forecast</small>
        <strong>
          {event.delta >= 0 ? "+" : ""}
          {event.delta.toFixed(2)} rating
        </strong>
      </div>
    </article>
  );
}

function MatchHistoryCard({
  event,
  personId,
  result,
}: {
  readonly event: PerformanceEvent;
  readonly personId: string;
  readonly result: MatchResult;
}) {
  const side = event.participants.find(
    (participant) => participant.personId === personId,
  )?.side;
  const teamA = teamName(event.participants, "A") || "Team A";
  const teamB = teamName(event.participants, "B") || "Team B";
  const setWins = event.sets.reduce(
    (record, set) => ({
      a: record.a + (set.a > set.b ? 1 : 0),
      b: record.b + (set.b > set.a ? 1 : 0),
    }),
    { a: 0, b: 0 },
  );
  const sourceUrl = publicSourceUrl(event.sourceUrl);
  return (
    <article data-result={result}>
      <header>
        <span className={`match-result match-result--${result}`}>
          {result === "win" ? "W" : result === "loss" ? "L" : "—"}
        </span>
        <div>
          <small>{event.matchTitle}</small>
          <strong>{formatMatchDate(event.occurredAt)}</strong>
        </div>
        <div className="match-history-card__forecast">
          <small>Pre-match forecast</small>
          <Numeric tier="block">
            {(predictedWinProbability(event) * 100).toFixed(0)}%
          </Numeric>
        </div>
      </header>
      <div className="match-history-card__score">
        <div className={side === "A" ? "is-player" : undefined}>
          <span>{teamA}</span>
          {event.sets.map((set, index) => (
            <Numeric
              className={set.a > set.b ? "is-set-winner" : undefined}
              key={`${event.id}-a-${index}`}
              tier="block"
            >
              {set.a}
            </Numeric>
          ))}
          <Numeric className="match-history-card__sets" tier="block">
            {setWins.a}
          </Numeric>
        </div>
        <div className={side === "B" ? "is-player" : undefined}>
          <span>{teamB}</span>
          {event.sets.map((set, index) => (
            <Numeric
              className={set.b > set.a ? "is-set-winner" : undefined}
              key={`${event.id}-b-${index}`}
              tier="block"
            >
              {set.b}
            </Numeric>
          ))}
          <Numeric className="match-history-card__sets" tier="block">
            {setWins.b}
          </Numeric>
        </div>
      </div>
      <footer>
        <span>
          Sand Rating
          <Numeric className={event.delta >= 0 ? "up" : "down"} tier="table">
            {event.beforeDisplay.toFixed(2)} → {event.afterDisplay.toFixed(2)} (
            {event.delta >= 0 ? "+" : ""}
            {event.delta.toFixed(2)})
          </Numeric>
        </span>
        <div>
          {event.canonicalMatchPath && (
            <Link href={event.canonicalMatchPath}>
              Match details <ArrowRight aria-hidden size={14} />
            </Link>
          )}
          {sourceUrl && (
            <a href={sourceUrl} rel="noreferrer" target="_blank">
              Official source <ExternalLink aria-hidden size={14} />
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
