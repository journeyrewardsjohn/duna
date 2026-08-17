"use client";

import type { PredictionMarketView, PublicProCoverage } from "@duna/api";
import { Badge } from "@duna/ui";
import { Activity, Globe2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProEventCard } from "@/components/pro-event-card";
import { ProfessionalMatchCard } from "@/components/professional-match-card";
import { ProScheduleCalendar } from "@/components/pro-schedule-calendar";
import { TourBrandMark, type TourBrand } from "@/components/tour-brand-mark";
import { instantIsoDay, parseIsoDay } from "@/lib/date-filter";

type ProEvent = PublicProCoverage["events"][number];
export type ProTourFilter = "all" | "elite" | "challenger" | "futures" | "avp";

const tourFilters: readonly {
  readonly value: ProTourFilter;
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
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: isoDay(start), end: isoDay(end) };
}

function overlaps(event: ProEvent, date: string): boolean {
  const start = event.startsOn ?? event.endsOn;
  const end = event.endsOn ?? event.startsOn;
  return Boolean(start && end && start <= date && end >= date);
}

function eventDays(event: ProEvent): readonly string[] {
  const start = event.startsOn ?? event.endsOn;
  const end = event.endsOn ?? event.startsOn;
  if (!start || !end) return [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  const days: string[] = [];
  while (cursor <= last && days.length < 32) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function EventShelf({
  eyebrow,
  events,
  live = false,
  title,
}: {
  readonly eyebrow: string;
  readonly events: readonly ProEvent[];
  readonly live?: boolean;
  readonly title: string;
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
          <ProEventCard event={event} key={event.id} />
        ))}
      </div>
    </section>
  );
}

function routeFor(tour: ProTourFilter, date?: string): string {
  const params = new URLSearchParams();
  if (tour !== "all") params.set("tour", tour);
  if (date) params.set("date", date);
  const query = params.toString();
  return query ? `/pro?${query}` : "/pro";
}

function selectionFromLocation(): {
  readonly tour: ProTourFilter;
  readonly date?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const requestedTour = params.get("tour");
  const tour = tourFilters.some((filter) => filter.value === requestedTour)
    ? (requestedTour as ProTourFilter)
    : "all";
  return { tour, date: parseIsoDay(params.get("date") ?? undefined) };
}

export function ProTourBrowser({
  coverage,
  initialDate,
  initialTour,
  predictionMarkets,
}: {
  readonly coverage: PublicProCoverage | undefined;
  readonly initialDate?: string;
  readonly initialTour: ProTourFilter;
  readonly predictionMarkets: Readonly<Record<string, PredictionMarketView>>;
}) {
  const [tour, setTour] = useState(initialTour);
  const [date, setDate] = useState(initialDate);
  const updateSelection = useCallback(
    (nextTour: ProTourFilter, nextDate?: string) => {
      setTour(nextTour);
      setDate(nextDate);
      window.history.pushState({}, "", routeFor(nextTour, nextDate));
    },
    [],
  );

  useEffect(() => {
    const onPopState = () => {
      const selection = selectionFromLocation();
      setTour(selection.tour);
      setDate(selection.date);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const tourEvents = useMemo(
    () =>
      (coverage?.events ?? []).filter(
        (event) => tour === "all" || event.tour === tour,
      ),
    [coverage?.events, tour],
  );
  const visibleEvents = useMemo(
    () =>
      date ? tourEvents.filter((event) => overlaps(event, date)) : tourEvents,
    [date, tourEvents],
  );
  const liveEvents = visibleEvents.filter((event) => event.live);
  const week = currentWeek();
  const thisWeekEvents = visibleEvents.filter(
    (event) =>
      !event.live &&
      event.status !== "completed" &&
      Boolean(
        event.startsOn &&
        event.endsOn &&
        event.startsOn <= week.end &&
        event.endsOn >= week.start,
      ),
  );
  const comingEvents = visibleEvents
    .filter(
      (event) =>
        event.status === "upcoming" &&
        !thisWeekEvents.some((candidate) => candidate.id === event.id),
    )
    .slice(0, 18);
  const matches = useMemo(
    () =>
      (coverage?.matches ?? [])
        .filter(
          (match) =>
            match.canonicalPath &&
            (tour === "all" || match.tour === tour) &&
            (!date ||
              (match.playedAt && instantIsoDay(match.playedAt) === date)),
        )
        .slice(0, 20),
    [coverage?.matches, date, tour],
  );
  const markers = useMemo(
    () => [
      ...tourEvents.flatMap((event) =>
        eventDays(event).map((day) => ({
          date: day,
          id: `event-${event.id}-${day}`,
          label: event.name,
          tone: "event" as const,
        })),
      ),
      ...(coverage?.matches ?? [])
        .filter((match) => tour === "all" || match.tour === tour)
        .flatMap((match) => {
          const matchDate = match.playedAt
            ? instantIsoDay(match.playedAt)
            : undefined;
          return matchDate
            ? [
                {
                  date: matchDate,
                  id: `match-${match.id}`,
                  label: match.title,
                  tone: "booking" as const,
                },
              ]
            : [];
        }),
    ],
    [coverage?.matches, tour, tourEvents],
  );
  const tourLabel =
    tourFilters.find((filter) => filter.value === tour)?.label ??
    "selected tour";

  return (
    <>
      <ProScheduleCalendar
        markers={markers}
        onDateChange={(nextDate) => updateSelection(tour, nextDate)}
        onReset={() => updateSelection(tour)}
        selectedDate={date}
        trackedEventCount={tourEvents.length}
      />
      <nav aria-label="Filter professional tours" className="pro-tour-filters">
        {tourFilters.map((filter) => (
          <button
            aria-current={tour === filter.value ? "page" : undefined}
            key={filter.value}
            onClick={() => updateSelection(filter.value, date)}
            type="button"
          >
            {filter.brand ? (
              <TourBrandMark brand={filter.brand} compact decorative />
            ) : (
              <Globe2 aria-hidden size={15} />
            )}
            {filter.label}
          </button>
        ))}
      </nav>

      {date ? (
        <EventShelf
          eyebrow={tourLabel}
          events={visibleEvents}
          live={liveEvents.length > 0}
          title={`Events on ${dateLabel(date)}`}
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
      {visibleEvents.length === 0 && (
        <p className="profile-empty">
          {date
            ? `No ${tour === "all" ? "professional" : tourLabel} events are scheduled on ${dateLabel(date)}.`
            : tour === "all"
              ? "No professional events are currently indexed."
              : `No ${tourLabel} events are currently indexed.`}
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
          {matches.length === 0 ? (
            <p className="profile-empty">
              No match updates are available for this tour yet.
            </p>
          ) : (
            matches.map((match) => (
              <ProfessionalMatchCard
                context={match.title}
                href={match.canonicalPath ?? "/pro"}
                key={match.id}
                playedAt={match.playedAt}
                predictionMarket={predictionMarkets[match.id]}
                roundLabel={match.roundLabel ?? match.title}
                sets={match.sets}
                source={match.source ?? "fivb"}
                status={
                  match.status ?? (match.winnerSide ? "completed" : "scheduled")
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
    </>
  );
}
