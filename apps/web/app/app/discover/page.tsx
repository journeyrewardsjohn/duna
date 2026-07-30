import { Badge, Numeric } from "@duna/ui";
import {
  CalendarDays,
  ChevronDown,
  LocateFixed,
  Map,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const caller = await getServerCaller();
  const [events, venues] = await Promise.all([
    caller.public.events(),
    caller.public.venues(),
  ]);
  const courtCount = venues.reduce(
    (total, venue) => total + venue.courtCount,
    0,
  );
  const market = venues[0]
    ? `${venues[0].city}, ${venues[0].region}`
    : "Connected markets";
  return (
    <main className="discover-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">{market}</span>
          <h1>Find your next game.</h1>
          <p>
            Open play, pickup, coaching, events, and courts—matched to your
            level.
          </p>
        </div>
        <button className="secondary-action">
          <Map aria-hidden size={17} /> Map view
        </button>
      </section>

      <section className="discover-filters">
        <label>
          <Search aria-hidden size={17} />
          <input
            aria-label="Search Duna"
            placeholder="Search places, people, events"
          />
        </label>
        <button>
          <CalendarDays aria-hidden size={16} />
          This week <ChevronDown aria-hidden size={14} />
        </button>
        <button>
          Rating <Numeric>4.0–5.0</Numeric>{" "}
          <ChevronDown aria-hidden size={14} />
        </button>
        <button>
          <SlidersHorizontal aria-hidden size={16} /> More filters
        </button>
      </section>

      <section className="discover-map-layout">
        <div className="discover-results">
          <div className="discover-results__heading">
            <span>
              <Numeric>{events.length}</Numeric>{" "}
              {events.length === 1 ? "published option" : "published options"}
            </span>
            <button>
              Recommended <ChevronDown aria-hidden size={14} />
            </button>
          </div>
          <div className="discover-event-grid">
            {events.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
            {events.length === 0 && (
              <article className="empty-state">
                <h2>No published play yet.</h2>
                <p>New sessions will appear here as operators publish them.</p>
              </article>
            )}
          </div>
          <section className="venue-booking-grid">
            <div className="discover-results__heading">
              <span>
                <Numeric>{venues.length}</Numeric>{" "}
                {venues.length === 1 ? "connected venue" : "connected venues"}
              </span>
            </div>
            {venues.map((venue) => (
              <Link
                className="venue-booking-card"
                href={`/app/venues/${venue.id}`}
                key={venue.id}
              >
                <span>
                  <strong>{venue.name}</strong>
                  <small>
                    {venue.city}, {venue.region}
                  </small>
                </span>
                <Badge>{venue.courtCount} courts</Badge>
              </Link>
            ))}
          </section>
        </div>
        <aside className="discovery-map" aria-label="South Bay activity map">
          <div className="discovery-map__water" />
          <div className="discovery-map__shore" />
          <div className="discovery-map__grid" />
          {venues.map((venue, index) => (
            <Link
              aria-label={`${venue.name}, ${venue.courtCount} courts`}
              className="map-pin"
              href={`/app/venues/${venue.id}`}
              key={venue.id}
              style={
                {
                  "--pin-x": `${31 + index * 23}%`,
                  "--pin-y": `${23 + index * 24}%`,
                } as React.CSSProperties
              }
            >
              <Numeric>{venue.courtCount}</Numeric>
            </Link>
          ))}
          <button
            aria-label="Center map on me"
            className="discovery-map__locate"
          >
            <LocateFixed aria-hidden size={18} />
          </button>
          <div className="discovery-map__legend">
            <Badge tone={courtCount > 0 ? "live" : "neutral"}>
              {courtCount} connected {courtCount === 1 ? "court" : "courts"}
            </Badge>
            <span>Live inventory from participating operators</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
