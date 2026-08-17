import type { PredictionMarketView } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import { Globe2, Radio } from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ProPlayerDiscovery,
  type ProDiscoveryPlayer,
} from "@/components/pro-player-discovery";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  ProTourBrowser,
  type ProTourFilter,
} from "@/components/pro-tour-browser";
import { getServerCaller } from "@/lib/api";
import { instantIsoDay, parseIsoDay } from "@/lib/date-filter";
import {
  absolutePublicUrl,
  professionalOgImageUrl,
  serializeJsonLd,
} from "@/lib/pro-seo";

const proTourSocialImage = professionalOgImageUrl({
  title: "The world’s game, in one live view.",
  eyebrow: "Professional beach volleyball",
  detail:
    "Beach Pro Tour · AVP Tournaments + League · live scores · Sand Rating",
});

export const metadata: Metadata = {
  title: "Pro beach volleyball",
  description:
    "Live FIVB and AVP events, recent results, seasonal rosters, and Volleyball World rankings on Duna.",
  alternates: {
    canonical: "/pro",
    types: { "text/markdown": "/pro.md" },
  },
  openGraph: {
    title: "Pro beach volleyball live events and results",
    description:
      "Follow Beach Pro Tour and AVP events, teams, schedules, scores, broadcasts, rankings, and Sand Rating context on Duna.",
    type: "website",
    url: "/pro",
    siteName: "Duna",
    images: [
      {
        url: proTourSocialImage,
        alt: "Professional beach volleyball coverage on Duna",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pro beach volleyball on Duna",
    description:
      "Beach Pro Tour and AVP events, teams, schedules, scores, broadcasts, and rankings.",
    images: [proTourSocialImage],
  },
  robots: { index: true, follow: true },
};

export default async function ProTourPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly tour?: string;
    readonly date?: string;
  }>;
}) {
  const [{ tour, date }, caller] = await Promise.all([
    searchParams,
    getServerCaller(),
  ]);
  const selectedTour: ProTourFilter = [
    "all",
    "elite",
    "challenger",
    "futures",
    "avp",
  ].includes(tour ?? "")
    ? (tour as ProTourFilter)
    : "all";
  const selectedDate = parseIsoDay(date);
  const [coverage, rankings] = await Promise.all([
    caller.public.proCoverage().catch(() => undefined),
    caller.public.worldRankings().catch(() => undefined),
  ]);
  const playersFor = (gender: "men" | "women"): ProDiscoveryPlayer[] =>
    (rankings?.world[gender] ?? []).flatMap((player) =>
      player.publicPath
        ? [
            {
              id: player.personId ?? player.publicPath,
              displayName: player.displayName,
              publicPath: player.publicPath,
              gender,
              worldRank: player.rank,
              points: player.points,
              countryCode: player.countryCode,
              avatarUrl: player.avatarUrl,
              sandRating: player.sandRating,
            },
          ]
        : [],
    );
  const proPlayers = [...playersFor("men"), ...playersFor("women")];
  const liveCount = coverage?.events.filter((event) => event.live).length ?? 0;
  const initialMatches =
    coverage?.matches
      .filter(
        (match) =>
          match.canonicalPath &&
          (selectedTour === "all" || match.tour === selectedTour) &&
          (!selectedDate ||
            (match.playedAt && instantIsoDay(match.playedAt) === selectedDate)),
      )
      .slice(0, 20) ?? [];
  const matchMarkets = await caller.public
    .proMatchPredictionMarkets({
      matches: initialMatches.flatMap((match) => {
        const eventSlug = match.canonicalPath?.split("/")[2];
        return eventSlug ? [{ eventSlug, matchId: match.id }] : [];
      }),
    })
    .catch((): Record<string, PredictionMarketView> => ({}));
  const featuredPlayers = proPlayers.filter((player) => player.worldRank <= 8);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${absolutePublicUrl("/pro")}#webpage`,
        url: absolutePublicUrl("/pro"),
        name: "Pro beach volleyball",
        description: metadata.description,
        mainEntity: { "@id": `${absolutePublicUrl("/pro")}#events` },
      },
      {
        "@type": "ItemList",
        "@id": `${absolutePublicUrl("/pro")}#events`,
        name: "Professional beach volleyball events",
        numberOfItems: coverage?.events.length ?? 0,
        itemListElement: (coverage?.events ?? []).map((event, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: event.name,
          url: absolutePublicUrl(`/events/${event.slug}`),
        })),
      },
      {
        "@type": "ItemList",
        "@id": `${absolutePublicUrl("/pro")}#players`,
        name: "Top professional beach volleyball players",
        numberOfItems: featuredPlayers.length,
        itemListElement: featuredPlayers.map((player, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absolutePublicUrl(player.publicPath),
          item: {
            "@type": "Person",
            name: player.displayName,
            nationality: player.countryCode
              ? { "@type": "Country", name: player.countryCode }
              : undefined,
          },
        })),
      },
    ],
  };

  return (
    <main className="pro-tour-page" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section className="pro-tour-hero" data-zone="athletic">
        <div>
          <Badge tone={liveCount ? "danger" : "neutral"}>
            <Radio aria-hidden size={12} />
            {liveCount ? (
              <>
                <Numeric tier="chip">{liveCount}</Numeric> live now
              </>
            ) : (
              "Pro tour"
            )}
          </Badge>
          <h1>The world&apos;s game, in one live view.</h1>
          <p>
            FIVB Elite, Challenger, and Futures events plus AVP tournaments and
            the AVP League. Duna connects every event to player identities,
            match history, and Sand Rating predictions.
          </p>
        </div>
        <div className="pro-tour-hero__stat">
          <Globe2 aria-hidden size={28} />
          <Numeric tier="hero">{coverage?.events.length ?? 0}</Numeric>
          <span>tracked events</span>
        </div>
        <div className="pro-tour-hero__media" aria-hidden>
          <Image
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 100vw, 1480px"
            src="/media/brand/duna-pro-hero-v3.webp"
          />
        </div>
        <div className="pro-tour-hero__veil" aria-hidden />
      </section>

      <section className="pro-tour-content">
        <ProTourBrowser
          coverage={coverage}
          initialDate={selectedDate}
          initialTour={selectedTour}
          predictionMarkets={matchMarkets}
        />

        {proPlayers.length > 0 && <ProPlayerDiscovery players={proPlayers} />}

        <section className="world-ranking-section">
          <header>
            <div>
              <span className="page-eyebrow">Official ranking snapshot</span>
              <h2>Volleyball World</h2>
            </div>
            <span>{coverage?.rankingDate ?? "Not refreshed"}</span>
          </header>
          <div className="world-ranking-grid">
            {(["men", "women"] as const).map((gender) => (
              <section key={gender}>
                <h3>{gender}</h3>
                {(coverage?.rankings ?? [])
                  .filter((ranking) => ranking.genderCategory === gender)
                  .slice(0, 10)
                  .map((ranking) => (
                    <article key={ranking.id}>
                      <Numeric tier="table">{ranking.rank}</Numeric>
                      <div>
                        <strong>{ranking.displayName}</strong>
                        <small>
                          {ranking.countryCode ?? "—"} ·{" "}
                          <Numeric tier="table">
                            {ranking.points.toFixed(0)}
                          </Numeric>{" "}
                          pts
                        </small>
                      </div>
                      <span>
                        {ranking.previousRank ? (
                          <>
                            was{" "}
                            <Numeric tier="chip">
                              {ranking.previousRank}
                            </Numeric>
                          </>
                        ) : (
                          "No prior snapshot"
                        )}
                      </span>
                    </article>
                  ))}
              </section>
            ))}
          </div>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}
