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
import { getServerCaller } from "@/lib/api";

export default async function PlayerDashboard() {
  const caller = await getServerCaller();
  const dashboard = await caller.player.dashboard();
  const { player } = dashboard;
  const nextEvent = dashboard.events[0];
  const latestMatch = dashboard.recentMatches[0];
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  return (
    <main className="player-dashboard">
      <section className="player-welcome">
        <div>
          <span className="page-eyebrow">{dateLabel}</span>
          <h1>Welcome back, {player.displayName.split(" ")[0]}.</h1>
          <p>
            Your rating, connected bookings, wallet, and available play are
            current below.
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
              <Badge tone="positive">
                {player.rating.confidence} confidence
              </Badge>
              <h2>Your portable Sand Rating.</h2>
            </div>
            <button aria-label="Share rating card">
              <Share2 aria-hidden size={18} />
            </button>
          </div>
          <div className="rating-panel__body">
            <RatingOrbit
              confidence={player.rating.confidence}
              delta={player.rating.delta}
              value={player.rating.display}
            />
            <div className="rating-panel__insight">
              <span>{latestMatch ? "Last movement" : "Rating state"}</span>
              <strong>
                {latestMatch
                  ? `${latestMatch.ratingDelta > 0 ? "+" : ""}${latestMatch.ratingDelta.toFixed(2)} after a ${latestMatch.verification.replace("-", " ")} result.`
                  : "No connected rating movement is available yet."}
              </strong>
              <p>
                Current rating{" "}
                <Numeric>{player.rating.display.toFixed(2)}</Numeric> ·
                discipline {player.rating.discipline.replace("-", " ")}
              </p>
              <Link href="/app/matches">
                Open match history <ArrowRight aria-hidden size={15} />
              </Link>
            </div>
          </div>
          <div className="rating-panel__stats">
            <div>
              <small>Confidence</small>
              <strong>{player.rating.confidence}</strong>
            </div>
            <div>
              <small>Home market</small>
              <strong>{player.homeMarket.split(",")[0]}</strong>
            </div>
            <div>
              <small>Connected matches</small>
              <Numeric>{dashboard.recentMatches.length}</Numeric>
            </div>
            <div>
              <small>Wallet</small>
              <Numeric>
                ${(dashboard.walletBalanceMinor / 100).toFixed(2)}
              </Numeric>
            </div>
          </div>
        </article>

        <article className="next-up-panel">
          <div className="panel-heading">
            <div>
              <span className="page-eyebrow">Next up</span>
              <h2>{nextEvent?.title ?? "Nothing booked yet"}</h2>
            </div>
            <Badge tone={nextEvent?.live ? "live" : "neutral"}>
              {nextEvent?.live ? "Live" : nextEvent ? "Published" : "Open"}
            </Badge>
          </div>
          <div className="next-up-panel__time">
            <Numeric>
              {nextEvent
                ? formatVenueTime(
                    nextEvent.startsAt,
                    nextEvent.timezone,
                    "en-US",
                    { minute: "2-digit" },
                  )
                : "—"}
            </Numeric>
            <small>
              {nextEvent ? nextEvent.tags[0] : "Explore available play"}
            </small>
          </div>
          <div className="next-up-panel__place">
            <MapPin aria-hidden size={17} />
            <span>
              <strong>{nextEvent?.venueName ?? "No venue selected"}</strong>
              <small>
                {nextEvent
                  ? `${nextEvent.spotsRemaining} spots remaining`
                  : "Published venues appear in Discover"}
              </small>
            </span>
          </div>
          <div className="next-up-panel__players">
            <div className="avatar-stack">
              <span className="avatar">{player.initials}</span>
            </div>
            <span>
              <Numeric>
                {nextEvent
                  ? `${nextEvent.capacity - nextEvent.spotsRemaining}/${nextEvent.capacity}`
                  : "0"}
              </Numeric>{" "}
              registered
            </span>
          </div>
          <Link
            className="next-up-panel__action"
            href={nextEvent ? `/events/${nextEvent.slug}` : "/app/discover"}
          >
            {nextEvent ? "Open event" : "Explore play"}{" "}
            <ChevronRight aria-hidden size={17} />
          </Link>
        </article>
      </section>

      <section className="metric-strip" aria-label="Player overview">
        {dashboard.metrics.map((metric) => (
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
          {dashboard.events.slice(0, 3).map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
          {dashboard.events.length === 0 && (
            <article className="empty-state">
              <p>No published events are available yet.</p>
            </article>
          )}
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
            {dashboard.recentMatches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
            {dashboard.recentMatches.length === 0 && (
              <article className="empty-state">
                <p>No connected matches yet.</p>
              </article>
            )}
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
            {dashboard.bookings.map((booking) => (
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
            {dashboard.bookings.length === 0 && (
              <article className="empty-state">
                <p>No confirmed bookings yet.</p>
              </article>
            )}
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
          {dashboard.feed.map((item) => (
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
          {dashboard.feed.length === 0 && (
            <article data-accent="aqua">
              <span>Connected feed</span>
              <h3>No new activity</h3>
              <p>
                Confirmed matches, registrations, and community updates will
                appear here.
              </p>
              <small>Up to date</small>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
