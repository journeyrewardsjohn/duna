import type { PublicProCoverage } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import { Activity, CalendarDays, Globe2, Radio, Trophy } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Pro beach volleyball",
  description:
    "Live FIVB and AVP events, recent results, seasonal rosters, and Volleyball World rankings on Duna.",
};

type ProEvent = PublicProCoverage["events"][number];
type TourFilter = "all" | "elite" | "challenger" | "futures" | "avp";

const tourFilters: readonly {
  readonly value: TourFilter;
  readonly label: string;
}[] = [
  { value: "all", label: "All tours" },
  { value: "elite", label: "Elite" },
  { value: "challenger", label: "Challenger" },
  { value: "futures", label: "Futures" },
  { value: "avp", label: "AVP" },
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
      <Trophy aria-hidden size={25} />
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
  readonly searchParams: Promise<{ readonly tour?: string }>;
}) {
  const [{ tour }, caller] = await Promise.all([
    searchParams,
    getServerCaller(),
  ]);
  const selectedTour: TourFilter = tourFilters.some(
    (filter) => filter.value === tour,
  )
    ? (tour as TourFilter)
    : "all";
  const coverage = await caller.public.proCoverage().catch(() => undefined);
  const filteredEvents =
    coverage?.events.filter(
      (event) => selectedTour === "all" || event.tour === selectedTour,
    ) ?? [];
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
          (selectedTour === "all" || match.tour === selectedTour),
      )
      .slice(0, 20) ?? [];
  const selectedTourLabel =
    tourFilters.find((filter) => filter.value === selectedTour)?.label ??
    "selected tour";

  return (
    <main className="pro-tour-page">
      <SiteHeader />
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
        <nav
          aria-label="Filter professional tours"
          className="pro-tour-filters"
        >
          {tourFilters.map((filter) => (
            <Link
              aria-current={selectedTour === filter.value ? "page" : undefined}
              href={
                filter.value === "all" ? "/pro" : `/pro?tour=${filter.value}`
              }
              key={filter.value}
            >
              {filter.label}
            </Link>
          ))}
        </nav>

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
        {filteredEvents.length === 0 && (
          <p className="profile-empty">
            {selectedTour === "all"
              ? "No professional events are currently indexed."
              : `No ${selectedTourLabel} events are currently indexed.`}
          </p>
        )}

        <section className="pro-live-results">
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
              filteredMatches.map((match) => {
                const team = (side: "A" | "B") =>
                  match.participants
                    .filter((participant) => participant.side === side)
                    .map((participant) => participant.name)
                    .join(" / ");
                return (
                  <article key={match.id}>
                    <Link href={match.canonicalPath ?? "/pro"}>
                      <div>
                        <small>{match.roundLabel ?? match.title}</small>
                        <strong>{team("A")}</strong>
                        <span>{team("B")}</span>
                      </div>
                      <div>
                        <strong>
                          {match.sets
                            .map((set) => `${set.a}–${set.b}`)
                            .join(" · ") || "Scheduled"}
                        </strong>
                        <small>
                          {match.playedAt
                            ? new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                              }).format(new Date(match.playedAt))
                            : "Time pending"}
                        </small>
                      </div>
                    </Link>
                  </article>
                );
              })
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
