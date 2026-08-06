import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { PredictionMarketDetail } from "@/components/prediction-market";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { compactPlayerName } from "@/lib/player-name";
import {
  absolutePublicUrl,
  professionalOgImageUrl,
  serializeJsonLd,
} from "@/lib/pro-seo";

export const dynamic = "force-dynamic";

const loadMatch = cache(async (matchId: string) => {
  const caller = await getServerCaller();
  const [match, videos] = await Promise.all([
    caller.public.matchDetails({ matchId }).catch(() => undefined),
    caller.public.videos({ matchId }).catch(() => []),
  ]);
  return { match, videos };
});

function teamLabel(
  players: readonly { readonly displayName: string }[],
  compact = false,
) {
  return players
    .map((player) =>
      compact ? compactPlayerName(player.displayName) : player.displayName,
    )
    .join(" / ");
}

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(value));
}

function sentenceCase(value: string) {
  const readable = value.replaceAll("-", " ");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function publicSourceUrl(value?: string) {
  if (!value) return undefined;
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase();
    if (hostname === "sandrating.com" || hostname.endsWith(".sandrating.com")) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ matchId: string }>;
}): Promise<Metadata> {
  const { matchId } = await params;
  const { match } = await loadMatch(matchId);
  if (!match) return { title: "Beach volleyball match · Duna" };
  const title = `${teamLabel(match.teamA, true)} vs ${teamLabel(match.teamB, true)}`;
  const description = `${title} at ${match.eventName ?? match.venueName}. View the set scores, players, and Duna Sand Rating model context.`;
  const socialImage = professionalOgImageUrl({
    title,
    eyebrow: match.eventName ?? "Beach volleyball match",
    detail: match.score
      .map(([teamA, teamB]) => `${teamA}–${teamB}`)
      .join(" · "),
  });
  return {
    title,
    description,
    alternates: { canonical: `/matches/${matchId}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/matches/${matchId}`,
      siteName: "Duna",
      images: [{ url: socialImage, alt: `${title} match result` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicMatchPage({
  params,
}: {
  readonly params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const { match, videos } = await loadMatch(matchId);
  if (!match) notFound();
  const caller = await getServerCaller();
  const [market, predictionWallet] = await Promise.all([
    caller.public.matchPredictionMarket({ matchId }).catch(() => undefined),
    caller.player.predictionWallet().catch(() => undefined),
  ]);
  const teamA = teamLabel(match.teamA, true);
  const teamB = teamLabel(match.teamB, true);
  const sourceUrl = publicSourceUrl(match.sourceUrl);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${absolutePublicUrl(`/matches/${matchId}`)}#match`,
    url: absolutePublicUrl(`/matches/${matchId}`),
    name: `${teamA} vs ${teamB}`,
    description: `${match.eventName ?? "Beach volleyball match"}: ${match.score
      .map(([scoreA, scoreB]) => `${scoreA}–${scoreB}`)
      .join(", ")}`,
    startDate: match.playedAt,
    eventStatus: "https://schema.org/EventCompleted",
    location: {
      "@type": "Place",
      name: match.location?.name ?? match.venueName,
      address: match.location?.address ?? match.location?.label,
    },
    competitor: [...match.teamA, ...match.teamB].map((player) => ({
      "@type": "Person",
      name: player.displayName,
      url: player.publicPath ? absolutePublicUrl(player.publicPath) : undefined,
    })),
    sameAs: sourceUrl ? [sourceUrl] : undefined,
  };

  return (
    <main className="public-match-page" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <div className="public-match-page__content match-detail">
        <header className="match-detail__header">
          <Link href="/pro#latest-match-updates">
            <ArrowLeft aria-hidden size={18} /> Pro tour
          </Link>
          <Badge tone="positive">
            <ShieldCheck aria-hidden size={14} /> Verified result
          </Badge>
        </header>

        <section className="match-detail__hero">
          <span className="page-eyebrow">{formattedDate(match.playedAt)}</span>
          <h1>{match.eventName ?? "Beach volleyball match"}</h1>
          <div className="match-detail__context">
            <span>
              <MapPin aria-hidden size={15} /> {match.venueName}
            </span>
            {match.roundLabel && <span>{match.roundLabel}</span>}
            {match.formatSummary && <span>{match.formatSummary}</span>}
            {sourceUrl && (
              <a href={sourceUrl} rel="noreferrer" target="_blank">
                Official source <ExternalLink aria-hidden size={13} />
              </a>
            )}
          </div>
          <div className="match-detail__score">
            <article className={match.winner === "A" ? "winner" : undefined}>
              <h2>{teamA}</h2>
              <div>
                {match.score.map(([score], index) => (
                  <Numeric key={`a-${index}`} tier="block">
                    {score}
                  </Numeric>
                ))}
              </div>
            </article>
            <span>VS</span>
            <article className={match.winner === "B" ? "winner" : undefined}>
              <h2>{teamB}</h2>
              <div>
                {match.score.map(([, score], index) => (
                  <Numeric key={`b-${index}`} tier="block">
                    {score}
                  </Numeric>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="match-detail__insight">
          <article>
            <Trophy aria-hidden size={21} />
            <span>
              <strong>Team {match.winner} won</strong>
              <small>
                {
                  match.score.filter(([a, b]) =>
                    match.winner === "A" ? a > b : b > a,
                  ).length
                }{" "}
                sets won
              </small>
            </span>
          </article>
          <article>
            <ShieldCheck aria-hidden size={21} />
            <span>
              <strong>{sentenceCase(match.verification)}</strong>
              <small>Approved professional evidence</small>
            </span>
          </article>
          {match.prediction && (
            <article
              className={
                match.prediction.outcome === "upset"
                  ? "match-detail__prediction match-detail__prediction--upset"
                  : "match-detail__prediction"
              }
            >
              <Sparkles aria-hidden size={21} />
              <span>
                <strong>
                  {match.prediction.outcome === "upset"
                    ? "Model upset"
                    : match.prediction.outcome === "predicted"
                      ? "Predicted outcome"
                      : "Even matchup"}
                </strong>
                <small>
                  {match.prediction.teamA.toFixed(0)}% /{" "}
                  {match.prediction.teamB.toFixed(0)}% pre-match
                </small>
              </span>
            </article>
          )}
        </section>

        {market && (
          <PredictionMarketDetail
            market={market}
            returnTo={`/matches/${matchId}`}
            target={{ kind: "match", matchId }}
            wallet={predictionWallet}
          />
        )}

        <section className="match-detail__players">
          {(
            [
              ["A", match.teamA],
              ["B", match.teamB],
            ] as const
          ).map(([side, players]) => (
            <article key={side}>
              <header>
                <span>Team {side}</span>
                {match.winner === side && <Badge tone="positive">Winner</Badge>}
              </header>
              {players.map((player) => {
                const identity = (
                  <>
                    <span className="avatar">{player.initials}</span>
                    <span>
                      <strong>{player.displayName}</strong>
                      <small>{player.homeMarket}</small>
                    </span>
                    <Numeric tier="table">
                      {player.rating.display.toFixed(2)}
                    </Numeric>
                  </>
                );
                return player.publicPath ? (
                  <Link href={player.publicPath} key={player.id}>
                    {identity}
                  </Link>
                ) : (
                  <div key={player.id}>{identity}</div>
                );
              })}
            </article>
          ))}
        </section>

        {videos.length > 0 && (
          <DunaVideoGallery
            description="Player-published coverage connected to this verified match."
            title={
              videos.some((video) => video.status === "live")
                ? "Watch this match live."
                : "Match replays."
            }
            videos={videos}
          />
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
