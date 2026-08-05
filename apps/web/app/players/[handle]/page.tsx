import type { PublicPlayerPerformance } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Globe2,
  MapPin,
  Sparkles,
  TrendingUp,
  Trophy,
  UserRoundCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RatingTrendChart,
  type RatingTrendPoint,
} from "@/components/rating-trend-chart";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";
import {
  getProfessionalEditorialSummary,
  professionalEditorialHash,
} from "@/lib/pro-editorial";

type PerformanceEvent = PublicPlayerPerformance["history"][number];
type PublicParticipant =
  PublicPlayerPerformance["history"][number]["participants"][number];

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
  const winner = setWins.a > setWins.b ? "A" : "B";
  return winner === side ? "win" : "loss";
}

function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function teamName(participants: readonly PublicParticipant[], side: "A" | "B") {
  return participants
    .filter((participant) => participant.side === side)
    .map((participant) => participant.name)
    .join(" / ");
}

function profileStateLabel(state: string | undefined) {
  if (state === "unclaimed") return "Unclaimed profile";
  if (state === "claim-pending") return "Claim under review";
  return "Claimed profile";
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const caller = await getServerCaller();
  const player = await caller.public
    .playerProfile({ handle })
    .catch(() => undefined);
  if (!player) return { title: "Player not found · Duna" };
  return {
    title: `${player.displayName} beach volleyball profile · Duna`,
    description: `${player.displayName}'s Sand Rating, verified match history, partnerships, and connected beach volleyball records.`,
    alternates: { canonical: `/players/${player.handle}` },
    openGraph: {
      title: `${player.displayName} · Sand Rating ${player.rating.display.toFixed(2)}`,
      description: `Match history and performance trends for ${player.displayName}.`,
      type: "profile",
      url: `/players/${player.handle}`,
      siteName: "Duna",
      images: player.avatarUrl ? [player.avatarUrl] : undefined,
    },
    twitter: {
      card: player.avatarUrl ? "summary_large_image" : "summary",
      title: `${player.displayName} · Sand Rating ${player.rating.display.toFixed(2)}`,
      description: `Verified beach volleyball match history and performance trends for ${player.displayName}.`,
      images: player.avatarUrl ? [player.avatarUrl] : undefined,
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
  const [player, performance, videos] = await Promise.all([
    caller.public.playerProfile({ handle }).catch(() => undefined),
    caller.public.playerPerformance({ handle }).catch(() => undefined),
    caller.public.videos({ ownerHandle: handle }).catch(() => []),
  ]);
  if (!player) notFound();

  const history = performance?.history ?? [];
  const results = history.map((event) => ({
    event,
    result: matchResult(event, player.id),
  }));
  const wins = results.filter(({ result }) => result === "win").length;
  const losses = results.filter(({ result }) => result === "loss").length;
  const unknown = results.length - wins - losses;
  const profileById = new Map(
    (performance?.participantProfiles ?? []).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const partnerships = new Map<
    string,
    {
      personId: string;
      handle: string;
      name: string;
      avatarUrl?: string;
      matches: number;
      wins: number;
      losses: number;
      lastPlayedAt: string;
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
      const profile = profileById.get(participant.personId);
      if (!profile?.handle) continue;
      const existing = partnerships.get(profile.id);
      partnerships.set(profile.id, {
        personId: profile.id,
        handle: profile.handle,
        name: profile.displayName,
        avatarUrl: profile.avatarUrl,
        matches: (existing?.matches ?? 0) + 1,
        wins: (existing?.wins ?? 0) + (result === "win" ? 1 : 0),
        losses: (existing?.losses ?? 0) + (result === "loss" ? 1 : 0),
        lastPlayedAt:
          !existing ||
          new Date(event.occurredAt) > new Date(existing.lastPlayedAt)
            ? event.occurredAt
            : existing.lastPlayedAt,
      });
    }
  }
  const partnershipRows = [...partnerships.values()].sort(
    (a, b) =>
      b.matches - a.matches ||
      new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime(),
  );
  const trendPoints: RatingTrendPoint[] = history.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt,
    rating: event.afterDisplay,
    before: event.beforeDisplay,
  }));
  const earliest = history
    .slice()
    .sort(
      (a, b) =>
        new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    )[0];
  const latest = history
    .slice()
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    )[0];
  const fallbackSummary = history.length
    ? `${player.displayName} has ${wins} verified wins and ${losses} losses across ${history.length} rated results in Duna. The connected record runs from ${formatMatchDate(earliest!.occurredAt)} through ${formatMatchDate(latest!.occurredAt)}, with a current Sand Rating of ${player.rating.display.toFixed(2)}.`
    : `${player.displayName}'s public profile is connected, but no approved match evidence is available yet.`;
  const editorial =
    player.isProfessional && history.length > 0
      ? await getProfessionalEditorialSummary({
          kind: "player",
          subject: player.displayName,
          facts: [
            `Current Sand Rating: ${player.rating.display.toFixed(2)} (${player.rating.discipline.replace("-", " ")}).`,
            `Verified record: ${wins} wins, ${losses} losses, ${unknown} results without a resolved winner, across ${history.length} rated matches.`,
            `Connected history spans ${formatMatchDate(earliest!.occurredAt)} through ${formatMatchDate(latest!.occurredAt)}.`,
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
  const claimPath = `/app/onboarding?claimProfile=${encodeURIComponent(player.handle)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: player.displayName,
    "@id": `${absolutePublicUrl(`/players/${player.handle}`)}#person`,
    url: absolutePublicUrl(`/players/${player.handle}`),
    image: player.avatarUrl,
    homeLocation: player.homeMarket
      ? { "@type": "Place", name: player.homeMarket }
      : undefined,
    description: editorial ?? fallbackSummary,
    knowsAbout: ["Beach volleyball", "Sand Rating"],
  };

  return (
    <main className="public-detail">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section className="public-profile-hero">
        <div className="public-profile-hero__dune" />
        <div className="public-profile-hero__identity">
          <span
            className="profile-avatar"
            style={
              player.avatarUrl
                ? { backgroundImage: `url("${player.avatarUrl}")` }
                : undefined
            }
          >
            {player.avatarUrl ? null : player.initials}
          </span>
          <div>
            <div className="profile-badge-row">
              <Badge>{profileStateLabel(player.profileClaimStatus)}</Badge>
              {player.isProfessional && (
                <Badge tone="positive">
                  <Trophy aria-hidden size={12} /> Professional
                </Badge>
              )}
              {performance?.worldRanking && (
                <Badge tone="warning">
                  <Globe2 aria-hidden size={12} /> World #
                  {performance.worldRanking.rank}
                </Badge>
              )}
            </div>
            <h1>{player.displayName}</h1>
            <p>
              @{player.handle}
              {player.homeMarket ? (
                <>
                  {" "}
                  · <MapPin aria-hidden size={14} /> {player.homeMarket}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="public-profile-hero__actions">
          {player.profileClaimStatus === "unclaimed" ? (
            <Link href={claimPath}>
              <UserRoundCheck aria-hidden size={17} /> Claim this profile
            </Link>
          ) : player.profileClaimStatus === "claim-pending" ? (
            <span>
              <UserRoundCheck aria-hidden size={17} /> Claim under review
            </span>
          ) : (
            <a href="#match-history">
              Explore results <ArrowRight aria-hidden size={16} />
            </a>
          )}
          {player.isProfessional && (
            <Link href="/pro">
              Pro tour <Trophy aria-hidden size={16} />
            </Link>
          )}
        </div>
        <RatingOrbit
          confidence={player.rating.confidence}
          delta={player.rating.delta}
          value={player.rating.display}
        />
      </section>

      <section className="public-profile-body">
        <div className="profile-summary-grid">
          <article>
            <small>Sand Rating</small>
            <Numeric>{player.rating.display.toFixed(2)}</Numeric>
            <span>{player.rating.discipline.replace("-", " ")}</span>
          </article>
          <article>
            <small>Confidence</small>
            <strong>{player.rating.confidence}</strong>
            <span>Verification-weighted</span>
          </article>
          <article>
            <small>Verified record</small>
            <strong>
              {wins}–{losses}
            </strong>
            <span>
              {history.length} rated matches
              {unknown ? ` · ${unknown} unresolved` : ""}
            </span>
          </article>
          <article>
            <small>Connected evidence</small>
            <strong>{performance?.sources.length ?? 0}</strong>
            <span>source profiles</span>
          </article>
        </div>

        {videos.length > 0 && (
          <DunaVideoGallery
            description={`${player.displayName}'s public live streams and selected match replays.`}
            eyebrow="Player video"
            title="From their side of the court."
            videos={videos}
          />
        )}

        {editorial && (
          <section className="public-profile-editorial">
            <span>
              <Sparkles aria-hidden size={18} />
              Professional form report
            </span>
            <h2>The story in the results.</h2>
            <p>{editorial}</p>
            <small>Regenerated when new verified match evidence arrives.</small>
          </section>
        )}

        {performance?.worldRanking && (
          <section className="pro-ranking-strip">
            <span>
              <Globe2 aria-hidden size={21} />
              <small>Volleyball World ranking</small>
              <strong>#{performance.worldRanking.rank}</strong>
            </span>
            <span>
              <small>Points</small>
              <Numeric>{performance.worldRanking.points.toFixed(0)}</Numeric>
            </span>
            <span>
              <small>Published</small>
              <strong>{performance.worldRanking.rankingDate}</strong>
            </span>
            <a href="/pro">
              Follow the pro tour <ExternalLink aria-hidden size={14} />
            </a>
          </section>
        )}

        <section className="profile-performance-grid">
          <div className="profile-rating-history">
            <header>
              <div>
                <span className="page-eyebrow">Rating history</span>
                <h2>Form over time.</h2>
                <p>Ordered by when every match was played—not imported.</p>
              </div>
              <TrendingUp aria-hidden size={24} />
            </header>
            <RatingTrendChart points={trendPoints} />
          </div>
          <aside className="profile-source-card">
            <span className="page-eyebrow">Provenance</span>
            <h2>Connected records</h2>
            {(performance?.sources ?? []).map((source) =>
              source.profileUrl ? (
                <a
                  href={source.profileUrl}
                  key={source.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>
                    <strong>{source.source}</strong>
                    <small>
                      {source.externalMatchCount
                        ? `${source.externalMatchCount} source matches`
                        : "Profile connected"}
                    </small>
                  </span>
                  <ExternalLink aria-hidden size={15} />
                </a>
              ) : (
                <div className="profile-source-card__record" key={source.id}>
                  <strong>{source.source}</strong>
                  <small>Profile connected</small>
                </div>
              ),
            )}
            {(performance?.sources.length ?? 0) === 0 && (
              <p>No external records are connected.</p>
            )}
          </aside>
        </section>

        {partnershipRows.length > 0 && (
          <section className="profile-partnerships">
            <header>
              <div>
                <span className="page-eyebrow">Partnerships</span>
                <h2>Who they&apos;ve built results with.</h2>
              </div>
              <Badge>{partnershipRows.length}</Badge>
            </header>
            <div>
              {partnershipRows.slice(0, 8).map((partner) => (
                <Link
                  href={`/teams/${player.handle}/${partner.handle}`}
                  key={partner.personId}
                >
                  <span
                    className="profile-partnerships__avatar"
                    style={
                      partner.avatarUrl
                        ? {
                            backgroundImage: `url("${partner.avatarUrl}")`,
                          }
                        : undefined
                    }
                  >
                    {partner.avatarUrl
                      ? null
                      : partner.name
                          .split(/\s+/)
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                  </span>
                  <span>
                    <strong>{partner.name}</strong>
                    <small>
                      {partner.matches} matches · {partner.wins}–
                      {partner.losses}
                    </small>
                  </span>
                  <ArrowRight aria-hidden size={16} />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="public-match-history" id="match-history">
          <header>
            <div>
              <span className="page-eyebrow">Match history</span>
              <h2>Results behind the rating.</h2>
            </div>
            <Badge>{history.length}</Badge>
          </header>
          <div>
            {results.map(({ event, result }) => {
              const side = event.participants.find(
                (participant) => participant.personId === player.id,
              )?.side;
              const opponentSide = side === "B" ? "A" : "B";
              return (
                <article data-result={result} key={event.id}>
                  <span
                    className={`match-date-chip match-date-chip--${result}`}
                  >
                    <CalendarDays aria-hidden size={15} />
                    {formatMatchDate(event.occurredAt)}
                  </span>
                  <span
                    className={`match-result match-result--${result}`}
                    aria-label={
                      result === "unknown"
                        ? "Winner unresolved"
                        : result === "win"
                          ? "Win"
                          : "Loss"
                    }
                  >
                    {result === "win" ? "W" : result === "loss" ? "L" : "—"}
                  </span>
                  <div>
                    <small>{event.matchTitle}</small>
                    <strong>
                      {teamName(event.participants, side ?? "A")} vs.{" "}
                      {teamName(event.participants, opponentSide)}
                    </strong>
                    <span>
                      {event.sets.length
                        ? event.sets
                            .map((set) => `${set.a}–${set.b}`)
                            .join(" · ")
                        : "Score not connected"}
                    </span>
                  </div>
                  <div className="match-rating-result">
                    <small>
                      {(event.expectedWinProbability * 100).toFixed(0)}%
                      expected
                    </small>
                    <strong className={event.delta >= 0 ? "up" : "down"}>
                      {event.delta >= 0 ? "+" : ""}
                      {event.delta.toFixed(2)}
                    </strong>
                    <Numeric>{event.afterDisplay.toFixed(2)}</Numeric>
                  </div>
                  <div className="public-match-history__actions">
                    {event.matchId && (
                      <Link href={`/app/matches/${event.matchId}`}>
                        Match details <ArrowRight aria-hidden size={14} />
                      </Link>
                    )}
                    {event.sourceUrl && (
                      <a
                        href={event.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Source <ExternalLink aria-hidden size={13} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
            {history.length === 0 && (
              <p className="profile-empty">
                This player has no approved rating events yet.
              </p>
            )}
          </div>
        </section>

        <section className="public-method-note">
          <span className="page-eyebrow">Trust the number</span>
          <h2>Imported evidence is never silently accepted.</h2>
          <p>
            Duna stores source provenance, identity mapping, expected result,
            actual result, score margin, and verification weight for each
            approved movement.
          </p>
          <a href="/methodology">Read the methodology</a>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}
