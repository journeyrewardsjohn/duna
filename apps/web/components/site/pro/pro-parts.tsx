import type { PublicProCoverage } from "@duna/api";
import { Icon, NetScore } from "@duna/ui/tideline";
import Link from "next/link";
import {
  dayLabel,
  eventDates,
  matchSets,
  matchStart,
  netScoreStatus,
  proHref,
  type ProEvent,
  type ProMatch,
  type ProTourFilter,
  tourFilters,
} from "./pro-data";

/** The tour filter and this week's days, as links: they work with no script. */
export function TourNav({
  tour,
  date,
  days,
}: {
  readonly tour: ProTourFilter;
  readonly date?: string;
  readonly days: readonly string[];
}) {
  return (
    <div className="site-tour-nav">
      <nav aria-label="Filter by tour" className="site-chips">
        {tourFilters.map((filter) => (
          <Link
            aria-current={tour === filter.value ? "page" : undefined}
            href={proHref(filter.value, date)}
            key={filter.value}
            scroll={false}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Filter by day" className="site-chips site-chips--days">
        <Link
          aria-current={!date ? "page" : undefined}
          href={proHref(tour)}
          scroll={false}
        >
          Any day
        </Link>
        {days.map((day) => (
          <Link
            aria-current={date === day ? "page" : undefined}
            href={proHref(tour, day)}
            key={day}
            scroll={false}
          >
            {dayLabel(day, "short")}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function EventStatus({ event }: { readonly event: ProEvent }) {
  if (event.live) {
    return (
      <span className="site-live-chip">
        <i aria-hidden="true" />
        Live
      </span>
    );
  }
  return (
    <span className="site-status" data-status="neutral">
      {event.status === "completed"
        ? "Finished"
        : event.status === "upcoming"
          ? "Upcoming"
          : event.status}
    </span>
  );
}

export function EventCard({ event }: { readonly event: ProEvent }) {
  const progress = event.matchCount
    ? Math.min(1, event.completedMatchCount / event.matchCount)
    : 0;
  return (
    <Link className="site-event" href={`/events/${event.slug}`}>
      <span className="site-event__top">
        <EventStatus event={event} />
        <span className="site-meta">
          {event.source === "avp" ? "AVP" : "Beach Pro Tour"} ·{" "}
          {event.genderCategory}
        </span>
      </span>
      <span className="site-event__name">{event.name}</span>
      <span className="site-event__meta">
        <span className="td-num">
          {eventDates(event.startsOn, event.endsOn)}
        </span>
        <span>{event.location ?? "Location to be announced"}</span>
      </span>
      {event.currentRound || event.liveMatchCount > 0 ? (
        <span className="site-event__round">
          {event.currentRound ? <b>{event.currentRound}</b> : null}
          {event.liveMatchCount > 0 ? (
            <span className="td-num">
              {event.liveMatchCount} live{" "}
              {event.liveMatchCount === 1 ? "match" : "matches"}
            </span>
          ) : null}
        </span>
      ) : null}
      {event.matchCount > 0 ? (
        <span className="site-event__progress">
          <span aria-hidden="true" className="site-bar site-bar--light">
            <i style={{ transform: `scaleX(${progress})` }} />
          </span>
          <span className="site-meta td-num">
            {event.completedMatchCount} of {event.matchCount} matches played
          </span>
        </span>
      ) : (
        <span className="site-meta">Match schedule not published yet</span>
      )}
    </Link>
  );
}

export function EventShelf({
  id,
  label,
  title,
  events,
}: {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly events: readonly ProEvent[];
}) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby={id} className="site-shelf">
      <header className="site-shelf__head">
        <p className="site-label">{label}</p>
        <h3 className="site-h3" id={id}>
          {title} <span className="td-num site-meta">{events.length}</span>
        </h3>
      </header>
      <ul className="site-events">
        {events.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MatchList({
  matches,
}: {
  readonly matches: readonly ProMatch[];
}) {
  if (matches.length === 0) {
    return <p className="site-empty">No match updates for this tour yet.</p>;
  }
  return (
    <ul className="site-matches">
      {matches.map((match) => (
        <li key={match.id}>
          <Link className="site-match" href={match.canonicalPath ?? "/pro"}>
            <span className="site-match__head">
              <span className="site-meta">
                {match.roundLabel ?? match.title}
              </span>
              <Icon name="chevron-right" size="inline" />
            </span>
            <NetScore
              announce={false}
              layout="rows"
              size="sm"
              sets={matchSets(match)}
              start={matchStart(match)}
              status={netScoreStatus(match.status)}
              teams={[match.teamA.label, match.teamB.label]}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Ranking = PublicProCoverage["rankings"][number];

export function WorldRankings({
  rankings,
  date,
}: {
  readonly rankings: readonly Ranking[];
  readonly date?: string | null;
}) {
  const groups = (["men", "women"] as const).map((gender) => ({
    gender,
    rows: rankings
      .filter((ranking) => ranking.genderCategory === gender)
      .slice(0, 10),
  }));
  if (groups.every((group) => group.rows.length === 0)) {
    return (
      <p className="site-empty">
        The ranking snapshot has not been refreshed yet.
      </p>
    );
  }
  return (
    <div className="site-rankings">
      {groups.map((group) => (
        <div className="site-table-wrap" key={group.gender}>
          <table className="site-table">
            <caption>
              {group.gender === "men" ? "Men" : "Women"}
              {date ? ` · snapshot ${date}` : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Team</th>
                <th scope="col">Points</th>
                <th scope="col">Before</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((ranking) => (
                <tr key={ranking.id}>
                  <td className="td-num">{ranking.rank}</td>
                  <th scope="row">
                    {ranking.displayName}
                    {ranking.countryCode ? (
                      <span className="site-meta">{ranking.countryCode}</span>
                    ) : null}
                  </th>
                  <td className="td-num">{ranking.points.toFixed(0)}</td>
                  <td className="td-num">
                    {ranking.previousRank ?? (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="td-sr">No earlier snapshot</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
