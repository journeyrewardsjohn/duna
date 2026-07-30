import { demoEvents, demoVenues } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import {
  CalendarDays,
  ChevronDown,
  LocateFixed,
  Map,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { EventCard } from "@/components/event-card";

export const metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <main className="discover-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">South Bay, Los Angeles</span>
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
              <Numeric>{demoEvents.length}</Numeric> strong matches for you
            </span>
            <button>
              Recommended <ChevronDown aria-hidden size={14} />
            </button>
          </div>
          <div className="discover-event-grid">
            {demoEvents.map((event) => (
              <EventCard event={event} key={event.id} />
            ))}
          </div>
        </div>
        <aside className="discovery-map" aria-label="South Bay activity map">
          <div className="discovery-map__water" />
          <div className="discovery-map__shore" />
          <div className="discovery-map__grid" />
          {demoVenues.map((venue, index) => (
            <button
              aria-label={`${venue.name}, ${venue.courtCount} courts`}
              className="map-pin"
              key={venue.id}
              style={
                {
                  "--pin-x": `${31 + index * 23}%`,
                  "--pin-y": `${23 + index * 24}%`,
                } as React.CSSProperties
              }
            >
              <Numeric>{venue.courtCount}</Numeric>
            </button>
          ))}
          <button
            aria-label="Center map on me"
            className="discovery-map__locate"
          >
            <LocateFixed aria-hidden size={18} />
          </button>
          <div className="discovery-map__legend">
            <Badge tone="live">14 live courts</Badge>
            <span>Your 4.0–5.0 filter is active</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
