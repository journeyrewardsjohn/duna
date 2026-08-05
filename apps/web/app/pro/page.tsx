import type { PublicProCoverage } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import { Activity, CalendarDays, Globe2, Radio, Trophy } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { DatePillFilter } from "@/components/date-pill-filter";
import { ProfessionalMatchCard } from "@/components/professional-match-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TourBrandMark, type TourBrand } from "@/components/tour-brand-mark";
import { getServerCaller } from "@/lib/api";
import {
  datePillDays,
  instantIsoDay,
  isoDay as currentIsoDay,
  parseIsoDay,
} from "@/lib/date-filter";
import {
  absolutePublicUrl,
  professionalOgImageUrl,
  serializeJsonLd,
} from "@/lib/pro-seo";

const proTourSocialImage = professionalOgImageUrl({
  title: "The world’s game, in one live view.",
  eyebrow: "Professional beach volleyball",
  detail: "Beach Pro Tour · AVP League · live scores · SandRating",
});

export const metadata: Metadata = {
  title: "Pro beach volleyball",
  description:
    "Live FIVB and AVP events, recent results, seasonal rosters, and Volleyball World rankings on Duna.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "Pro beach volleyball live events and results",
    description:
      "Follow Beach Pro Tour and AVP events, teams, schedules, scores, broadcasts, rankings, and SandRating context on Duna.",
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

type ProEvent = PublicProCoverage["events"][number];
type TourFilter = "all" | "elite" | "challenger" | "futures" | "avp";

const tourFilters: readonly {
  readonly value: TourFilter;
  readonly label: string;
  readonly brand?: TourBrand;
}[] = [
  { value: "all", label: "All tours" },
  { value: "elite", label: "Elite", brand: "fivb" },
  { value: "challenger", label: "Challenger", brand: "fivb" },
  { value: "futures", label: "Futures", brand: "fivb" },
  { value: "avp", label: "AVP", brand: "avp" },
];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currentWeek(now = new Date()): {
  readonly start: string;
  readonly end: string;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: isoDay(start), end: isoDay(end) };
}

function overlaps(
  event: ProEvent,
  window: { readonly start: string; readonly end: string },
): boolean {
  const starts = event.startsOn ?? event.endsOn;
  const ends = event.endsOn ?? event.startsOn;
  return Boolean(
    starts && ends && starts <= window.end && ends >= window.start,
  );
}

function EventCard({ event }: { readonly event: ProEvent }) {
  return (
    <Link className="pro-event-card" href={`/events/${event.slug}`}>
      <div>
        <Badge tone={event.live ? "danger" : "neutral"}>
          {event.live ? "Live" : event.status}
        </Badge>
        <span>{event.genderCategory}</span>
      </div>
      <div className="pro-event-card__brand">
        <TourBrandMark brand={event.source} />
        <Trophy aria-hidden size={22} />
      </div>
      <h3>{event.name}</h3>
      <p>{event.category ?? "Professional beach volleyball"}</p>
      <footer>
        <span>
          <CalendarDays aria-hidden size={14} />
          {event.startsOn ?? "Date pending"}
        </span>
        <span>{event.location ?? "Location pending"}</span>
      </footer>
    </Link>
  );
}

function EventShelf({
  eyebrow,
  title,
  events,
  live = false,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly events: readonly ProEvent[];
  readonly live?: boolean;
}) {
  if (events.length === 0) return null;
  return (
    <section
      className={
        live ? "pro-event-section pro-event-section--live" : "pro-event-section"
      }
    >
      <header>
        <div>
          <span className="page-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <Badge tone={live ? "danger" : "neutral"}>{events.length}</Badge>
      </header>
      <div className="pro-event-grid">
        {events.map((event) => (
          <EventCard event={event} key={event.id} />
        ))}
      </div>
    </section>
  );
}

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
  const selectedTour: TourFilter = tourFilters.some(
    (filter) => filter.value === tour,
  )
    ? (tour as TourFilter)
    : "all";
  const selectedDate = parseIsoDay(date);
  const proHref = (
    nextTour: TourFilter,
    nextDate: string | null | undefined = selectedDate,
  ) => {
    const params = new URLSearchParams();
    if (nextTour !== "all") params.set("tour", nextTour);
    if (nextDate) params.set("date", nextDate);
    const query = params.toString();
    return query ? `/pro?${query}` : "/pro";
  };
  const coverage = await caller.public.proCoverage().catch(() => undefined);
  const tourEvents =
    coverage?.events.filter(
      (event) => selectedTour === "all" || event.tour === selectedTour,
    ) ?? [];
  const filteredEvents = selectedDate
    ? tourEvents.filter((event) =>
        overlaps(event, { start: selectedDate, end: selectedDate }),
      )
    : tourEvents;
  const liveEvents = filteredEvents.filter((event) => event.live);
  const week = currentWeek();
  const thisWeekEvents = filteredEvents.filter(
    (event) =>
      !event.live && event.status !== "completed" && overlaps(event, week),
  );
  const comingEvents = filteredEvents
    .filter(
      (event) =>
        event.status === "upcoming" &&
        !thisWeekEvents.some((candidate) => candidate.id === event.id),
    )
    .slice(0, 18);
  const filteredMatches =
    coverage?.matches
      .filter(
        (match) =>
          match.canonicalPath &&
          (selectedTour === "all" || match.tour === selectedTour) &&
          (!selectedDate ||
            (match.playedAt && instantIsoDay(match.playedAt) === selectedDate)),
      )
      .slice(0, 20) ?? [];
  const selectedTourLabel =
    tourFilters.find((filter) => filter.value === selectedTour)?.label ??
    "selected tour";
  const calendarDays = datePillDays(selectedDate ?? currentIsoDay());
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${selectedDate}T12:00:00Z`))
    : undefined;
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
    ],
  };

  return (
    <main className="pro-tour-page">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section className="pro-tour-hero">
        <div>
          <Badge tone={liveEvents.length ? "danger" : "neutral"}>
            <Radio aria-hidden size={12} />
            {liveEvents.length ? `${liveEvents.length} live now` : "Pro tour"}
          </Badge>
          <h1>The world&apos;s game, in one live view.</h1>
          <p>
            FIVB Elite, Challenger, and Futures events plus the AVP League—
            connected to Duna player identities, match history, and Sand Rating
            predictions.
          </p>
        </div>
        <div className="pro-tour-hero__orb">
          <Globe2 aria-hidden size={54} />
          <Numeric>{coverage?.events.length ?? 0}</Numeric>
          <span>tracked events</span>
        </div>
      </section>

      <section className="pro-tour-content">
        <DatePillFilter
          allHref={proHref(selectedTour, null)}
          dates={calendarDays}
          eyebrow="Quick date"
          hrefForDate={(nextDate) => proHref(selectedTour, nextDate)}
          selectedDate={selectedDate}
          title="Scores and schedule"
        />
        <nav
          aria-label="Filter professional tours"
          className="pro-tour-filters"
        >
          {tourFilters.map((filter) => (
            <Link
              aria-current={selectedTour === filter.value ? "page" : undefined}
              href={proHref(filter.value)}
              key={filter.value}
            >
              {filter.brand ? (
                <TourBrandMark brand={filter.brand} compact decorative />
              ) : (
                <Globe2 aria-hidden size={15} />
              )}
              {filter.label}
            </Link>
          ))}
        </nav>

        {selectedDate ? (
          <EventShelf
            eyebrow={selectedTourLabel}
            events={filteredEvents}
            live={liveEvents.length > 0}
            title={`Events on ${selectedDateLabel}`}
          />
        ) : (
          <>
            <EventShelf
              eyebrow="Updating frequently"
              events={liveEvents}
              live
              title="Live now"
            />
            <EventShelf
              eyebrow={`${week.start} – ${week.end}`}
              events={thisWeekEvents}
              title="Events this week"
            />
            <EventShelf
              eyebrow="On the calendar"
              events={comingEvents}
              title="Coming up"
            />
          </>
        )}
        {filteredEvents.length === 0 && (
          <p className="profile-empty">
            {selectedDate
              ? `No ${selectedTour === "all" ? "professional" : selectedTourLabel} events are scheduled on ${selectedDateLabel}.`
              : selectedTour === "all"
                ? "No professional events are currently indexed."
                : `No ${selectedTourLabel} events are currently indexed.`}
          </p>
        )}

        <section className="pro-live-results" id="latest-match-updates">
          <header>
            <div>
              <span className="page-eyebrow">Live reporting</span>
              <h2>Latest match updates</h2>
            </div>
            <Activity aria-hidden size={22} />
          </header>
          <div>
            {filteredMatches.length === 0 ? (
              <p className="profile-empty">
                No match updates are available for this tour yet.
              </p>
            ) : (
              filteredMatches.map((match) => (
                <ProfessionalMatchCard
                  context={match.title}
                  href={match.canonicalPath ?? "/pro"}
                  key={match.id}
                  playedAt={match.playedAt}
                  roundLabel={match.roundLabel ?? match.title}
                  sets={match.sets}
                  source={match.source ?? "fivb"}
                  status={
                    match.status ??
                    (match.winnerSide ? "completed" : "scheduled")
                  }
                  teamA={match.teamA}
                  teamB={match.teamB}
                  winnerSide={
                    match.winnerSide === "A" || match.winnerSide === "B"
                      ? match.winnerSide
                      : undefined
                  }
                />
              ))
            )}
          </div>
        </section>

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
                      <Numeric>{ranking.rank}</Numeric>
                      <div>
                        <strong>{ranking.displayName}</strong>
                        <small>
                          {ranking.countryCode ?? "—"} ·{" "}
                          {ranking.points.toFixed(0)} pts
                        </small>
                      </div>
                      <span>
                        {ranking.previousRank
                          ? `was ${ranking.previousRank}`
                          : "new"}
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
