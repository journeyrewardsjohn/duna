import "../pages.css";

import { log } from "@duna/observability";
import { NetScore } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { GlassCard } from "@/components/site/glass-card";
import { LinkButton } from "@/components/site/link-button";
import { siteLinks } from "@/components/site/links";
import { sitePhotos } from "@/components/site/media";
import { PageHero, SectionHead } from "@/components/site/page-parts";
import {
  dayLabel,
  eventShelves,
  heroMatch,
  matchSets,
  matchStart,
  netScoreStatus,
  parseTour,
  tourFilters,
  visibleMatches,
} from "@/components/site/pro/pro-data";
import {
  EventShelf,
  MatchList,
  TourNav,
  WorldRankings,
} from "@/components/site/pro/pro-parts";
import {
  type ProFinderPlayer,
  PlayerFinder,
} from "@/components/site/pro/player-finder";
import { ConceptStage } from "@/components/site/stage";
import { getServerCaller } from "@/lib/api";
import { parseIsoDay } from "@/lib/date-filter";
import {
  absolutePublicUrl,
  professionalOgImageUrl,
  serializeJsonLd,
} from "@/lib/pro-seo";

const proTourSocialImage = professionalOgImageUrl({
  title: "The world’s game, point by point.",
  eyebrow: "Pro Tour",
  detail:
    "Beach Pro Tour · AVP Tournaments + League · live scores · Sand Rating",
});

const description =
  "Live and upcoming Beach Pro Tour and AVP events, the latest match updates, players and the Volleyball World ranking on Duna.";

export const metadata: Metadata = {
  title: { absolute: "Pro Tour · Duna" },
  description,
  alternates: {
    canonical: "/pro",
    types: { "text/markdown": "/pro.md" },
  },
  openGraph: {
    title: "Pro beach volleyball live events and results",
    description,
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
    description,
    images: [proTourSocialImage],
  },
  robots: { index: true, follow: true },
};

async function load() {
  const caller = await getServerCaller();
  const [coverage, rankings] = await Promise.all([
    caller.public.proCoverage().catch((error: unknown) => {
      log.warn("site.pro.coverage.unavailable", {
        error: error instanceof Error ? error.name : "unknown",
      });
      return undefined;
    }),
    caller.public.worldRankings().catch(() => undefined),
  ]);
  return { coverage, rankings };
}

/**
 * The Pro Tour (`/pro`) in the new shell, on its existing data: the
 * `public.proCoverage` feed (events, matches, the ranking snapshot) and
 * `public.worldRankings` (players with Duna profiles). Same address, same
 * `?tour=` and `?date=` filters, now links that work without script. The
 * hero shows a genuinely live match when there is one, otherwise the next
 * scheduled one; Solar appears only on live things.
 */
export default async function ProTourPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly tour?: string;
    readonly date?: string;
  }>;
}) {
  const [{ tour: tourParam, date: dateParam }, { coverage, rankings }] =
    await Promise.all([searchParams, load()]);
  const tour = parseTour(tourParam);
  const date = parseIsoDay(dateParam);
  const shelves = eventShelves(coverage, tour, date);
  const matches = visibleMatches(coverage, tour, date);
  const featured = heroMatch(coverage);
  const liveCount = coverage?.events.filter((event) => event.live).length ?? 0;
  const tourLabel =
    tourFilters.find((filter) => filter.value === tour)?.label ?? "All tours";
  const players: ProFinderPlayer[] = (["men", "women"] as const).flatMap(
    (gender) =>
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
      ),
  );
  const page = absolutePublicUrl("/pro");
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${page}#webpage`,
        url: page,
        name: "Pro beach volleyball",
        description,
        mainEntity: { "@id": `${page}#events` },
      },
      {
        "@type": "ItemList",
        "@id": `${page}#events`,
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
        "@id": `${page}#players`,
        name: "Top professional beach volleyball players",
        itemListElement: players
          .filter((player) => player.worldRank <= 8)
          .map((player, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: absolutePublicUrl(player.publicPath),
            item: { "@type": "Person", name: player.displayName },
          })),
      },
    ],
  };

  return (
    <main
      className="site-page-main"
      data-zone="athletic"
      id="main"
      tabIndex={-1}
    >
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <PageHero
        actions={
          <>
            <LinkButton arrow href="#latest-match-updates" variant="primary">
              Today’s matches
            </LinkButton>
            <LinkButton href={siteLinks.rankings} variant="secondary">
              Rankings
            </LinkButton>
          </>
        }
        id="pro-title"
        label={
          liveCount > 0 ? (
            <span className="site-live-chip">
              <i aria-hidden="true" />
              <span className="td-num">{liveCount}</span> live now
            </span>
          ) : (
            "Pro Tour"
          )
        }
        lead="FIVB Elite, Challenger and Futures events, AVP tournaments and the AVP League. Every event, match and team linked to player profiles, match history and Sand Rating predictions."
        note={
          coverage
            ? `${coverage.events.length} events tracked.`
            : "The tour feed is not available right now. Try again shortly."
        }
        stage={
          <ConceptStage
            credit="Generated image"
            photo={sitePhotos.beachAttack}
            priority
            shape="wide"
            sizes="(max-width: 1000px) 100vw, 50vw"
          >
            {featured ? (
              <GlassCard
                className="site-pro-feature"
                label={featured.status === "live" ? "Live now" : "Next match"}
              >
                <p className="site-meta">{featured.title}</p>
                <NetScore
                  bestOf={3}
                  layout="net"
                  sets={matchSets(featured)}
                  size="sm"
                  start={matchStart(featured)}
                  status={netScoreStatus(featured.status)}
                  teams={[featured.teamA.label, featured.teamB.label]}
                />
                {featured.canonicalPath ? (
                  <LinkButton
                    href={featured.canonicalPath}
                    size="sm"
                    variant="secondary"
                  >
                    Open the match
                  </LinkButton>
                ) : null}
              </GlassCard>
            ) : (
              <GlassCard label="Pro Tour">
                <p className="site-body">
                  No match is live or scheduled in the feed right now.
                </p>
              </GlassCard>
            )}
          </ConceptStage>
        }
        title="The world’s game, point by point."
      />

      <section
        aria-labelledby="events-title"
        className="site-wrap site-section"
        id="events"
      >
        <SectionHead
          id="events-title"
          label={date ? tourLabel : "This week"}
          title={date ? "Events on the day you chose." : "Follow the tour."}
        />
        <TourNav date={date} days={shelves.week.days} tour={tour} />
        {date ? (
          <EventShelf
            events={shelves.visible}
            id="shelf-day"
            label={tourLabel}
            title={`Events on ${dayLabel(date)}`}
          />
        ) : (
          <>
            <EventShelf
              events={shelves.live}
              id="shelf-live"
              label="Updating as it happens"
              title="Live now"
            />
            <EventShelf
              events={shelves.thisWeek}
              id="shelf-week"
              label={`${shelves.week.start} – ${shelves.week.end}`}
              title="Events this week"
            />
            <EventShelf
              events={shelves.coming}
              id="shelf-coming"
              label="On the calendar"
              title="Coming up"
            />
          </>
        )}
        {shelves.visible.length === 0 ? (
          <p className="site-empty">
            {date
              ? `No ${tour === "all" ? "professional" : tourLabel} events on that day.`
              : tour === "all"
                ? "No professional events are listed yet."
                : `No ${tourLabel} events are listed yet.`}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="updates-title"
        className="site-wrap site-section"
        id="latest-match-updates"
      >
        <SectionHead
          id="updates-title"
          label="Live reporting"
          title="Latest match updates"
        />
        <MatchList matches={matches} />
      </section>

      {players.length > 0 ? (
        <section
          aria-labelledby="players-title"
          className="site-wrap site-section"
          id="players"
        >
          <SectionHead
            id="players-title"
            label="Player directory"
            title="Know who to watch."
          />
          <PlayerFinder players={players} />
        </section>
      ) : null}

      <section
        aria-labelledby="world-title"
        className="site-wrap site-section"
        id="world-ranking"
      >
        <SectionHead
          chip={
            <span className="site-meta">
              {coverage?.rankingDate
                ? `Snapshot ${coverage.rankingDate}`
                : "Not refreshed yet"}
            </span>
          }
          id="world-title"
          label="Official ranking snapshot"
          title="Volleyball World"
        />
        <WorldRankings
          date={coverage?.rankingDate}
          rankings={coverage?.rankings ?? []}
        />
      </section>
    </main>
  );
}
