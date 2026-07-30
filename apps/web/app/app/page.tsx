import {
  demoBookings,
  demoEvents,
  demoFeed,
  demoMatches,
  demoPlayer,
  playerMetrics,
} from "@duna/core/demo";
import { formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  MapPin,
  Plus,
  Share2,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { MatchCard } from "@/components/match-card";
import { RatingOrbit } from "@/components/rating-orbit";

export default function PlayerDashboard() {
  return (
    <main className="player-dashboard">
      <section className="player-welcome">
        <div>
          <span className="page-eyebrow">Thursday, July 30</span>
          <h1>Good afternoon, Mara.</h1>
          <p>
            The beach is moving. You have a game tonight and two new rating
            moments.
          </p>
        </div>
        <div className="player-welcome__actions">
          <Link className="secondary-action" href="/app/pickup/new">
            <CalendarDays aria-hidden size={17} /> Host pickup
          </Link>
          <Link className="primary-action" href="/app/score">
            <Plus aria-hidden size={18} /> Record a match
          </Link>
        </div>
      </section>

      <section className="player-hero-grid">
        <article className="rating-panel">
          <div className="rating-panel__header">
            <div>
              <Badge tone="positive">Locked confidence</Badge>
              <h2>Your best form is becoming your baseline.</h2>
            </div>
            <button aria-label="Share rating card">
              <Share2 aria-hidden size={18} />
            </button>
          </div>
          <div className="rating-panel__body">
            <RatingOrbit
              confidence={demoPlayer.rating.confidence}
              delta={demoPlayer.rating.delta}
              value={demoPlayer.rating.display}
            />
            <div className="rating-panel__insight">
              <span>Last movement</span>
              <strong>Closed against a stronger pair in three.</strong>
              <p>
                Expected win <Numeric>44%</Numeric> · verification{" "}
                <Numeric>1.00</Numeric> · point share <Numeric>53%</Numeric>
              </p>
              <Link href="/app/matches/match-1">
                See why it moved <ArrowRight aria-hidden size={15} />
              </Link>
            </div>
          </div>
          <div className="rating-panel__stats">
            <div>
              <small>52-week peak</small>
              <Numeric>4.68</Numeric>
            </div>
            <div>
              <small>South Bay rank</small>
              <Numeric>#42</Numeric>
            </div>
            <div>
              <small>Matches</small>
              <Numeric>84</Numeric>
            </div>
            <div>
              <small>Next band</small>
              <Numeric>5.00</Numeric>
            </div>
          </div>
        </article>

        <article className="next-up-panel">
          <div className="panel-heading">
            <div>
              <span className="page-eyebrow">Next up</span>
              <h2>Golden Hour 4s</h2>
            </div>
            <Badge tone="live">Tonight</Badge>
          </div>
          <div className="next-up-panel__time">
            <Numeric>6:00</Numeric>
            <span>PM</span>
            <small>in 4h 12m</small>
          </div>
          <div className="next-up-panel__place">
            <MapPin aria-hidden size={17} />
            <span>
              <strong>Hermosa Beach — Pier Courts</strong>
              <small>Court 7 · 1.8 miles away</small>
            </span>
          </div>
          <div className="next-up-panel__players">
            <div className="avatar-stack">
              {["TP", "NW", "ET", "+2"].map((value) => (
                <span className="avatar" key={value}>
                  {value}
                </span>
              ))}
            </div>
            <span>
              <Numeric>6/8</Numeric> confirmed
            </span>
          </div>
          <Link
            className="next-up-panel__action"
            href="/events/golden-hour-fours"
          >
            Open game thread <ChevronRight aria-hidden size={17} />
          </Link>
        </article>
      </section>

      <section className="metric-strip" aria-label="Player overview">
        {playerMetrics.map((metric) => (
          <article key={metric.label}>
            <small>{metric.label}</small>
            <Numeric>{metric.value}</Numeric>
            {metric.change && (
              <span className={metric.trend === "up" ? "positive" : undefined}>
                {metric.change}
              </span>
            )}
          </article>
        ))}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Made for you</span>
            <h2>Play next</h2>
          </div>
          <Link href="/app/discover">
            See all <ArrowRight aria-hidden size={15} />
          </Link>
        </div>
        <div className="player-event-row">
          {demoEvents.slice(1, 4).map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      </section>

      <section className="dashboard-two-column">
        <div className="dashboard-section">
          <div className="dashboard-section__heading">
            <div>
              <span className="page-eyebrow">Recent results</span>
              <h2>Match history</h2>
            </div>
            <Link href="/app/matches">
              All matches <ArrowRight aria-hidden size={15} />
            </Link>
          </div>
          <div className="match-list">
            {demoMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__heading">
            <div>
              <span className="page-eyebrow">On your calendar</span>
              <h2>Coming up</h2>
            </div>
          </div>
          <div className="booking-list">
            {demoBookings.map((booking) => (
              <Link href="/app/play" key={booking.id}>
                <span className="booking-list__date">
                  <Numeric>
                    {formatVenueTime(
                      booking.startsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { day: "numeric" },
                    )}
                  </Numeric>
                </span>
                <span>
                  <strong>{booking.title}</strong>
                  <small>{booking.venueName}</small>
                </span>
                <Badge
                  tone={booking.status === "confirmed" ? "positive" : "warning"}
                >
                  {booking.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-section feed-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Your world on sand</span>
            <h2>Happening now</h2>
          </div>
        </div>
        <div className="feed-grid">
          {demoFeed.map((item) => (
            <article data-accent={item.accent} key={item.id}>
              <div className="feed-grid__icon">
                {item.accent === "flare" ? (
                  <Trophy aria-hidden size={20} />
                ) : (
                  <Sparkles aria-hidden size={20} />
                )}
              </div>
              <span>{item.eyebrow}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <small>{item.meta}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
