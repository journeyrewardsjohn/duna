import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Play" };

export default async function PlayPage() {
  const caller = await getServerCaller();
  const [dashboard, venues] = await Promise.all([
    caller.player.dashboard(),
    caller.public.venues(),
  ]);
  const pickups = dashboard.events.filter((event) => event.kind === "pickup");
  const featuredPickup = pickups[0];
  const featuredVenue = venues[0];
  const today = new Date();
  const calendarDays = Array.from({ length: 9 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      day: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      date: String(date.getDate()).padStart(2, "0"),
      month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
      active: index === 0,
      iso: date.toISOString(),
    };
  });
  const nextBooking = dashboard.bookings[0];

  return (
    <main className="standard-page play-page">
      <section className="page-heading-row play-page__heading">
        <div>
          <span className="page-eyebrow">Your game, your people</span>
          <h1>Make a plan to play.</h1>
          <p>
            Book a court, open a match, or join a nearby run without the
            group-chat shuffle.
          </p>
        </div>
        <div className="play-page__actions">
          <Link className="secondary-action" href="/app/discover">
            <Building2 aria-hidden size={17} /> Book a court
          </Link>
          <Link className="primary-action" href="/app/pickup/new">
            <Plus aria-hidden size={18} /> Host a match
          </Link>
        </div>
      </section>

      <section className="play-planner">
        <article className="play-agenda">
          <div className="play-agenda__heading">
            <div>
              <span className="page-eyebrow">Your calendar</span>
              <h2>When do you want to play?</h2>
            </div>
            <span className="play-agenda__count">
              <CalendarDays aria-hidden size={17} />
              {dashboard.bookings.length} scheduled
            </span>
          </div>

          <div aria-label="Choose a day" className="play-date-strip">
            {calendarDays.map((item) => (
              <div
                aria-current={item.active ? "date" : undefined}
                className={item.active ? "active" : undefined}
                key={item.iso}
              >
                <small>{item.day}</small>
                <Numeric>{item.date}</Numeric>
                <span>{item.month}</span>
                {dashboard.bookings.some(
                  (booking) =>
                    new Date(booking.startsAt).toDateString() ===
                    new Date(item.iso).toDateString(),
                ) ? (
                  <i />
                ) : null}
              </div>
            ))}
          </div>

          <div className="play-day">
            <div className="play-day__header">
              <div>
                <strong>Today</strong>
                <span>
                  {today.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <button aria-label="Connect another calendar" type="button">
                <CalendarPlus aria-hidden size={18} />
                Add calendar
              </button>
            </div>
            {nextBooking ? (
              <div className="play-day__booking">
                <span className="play-day__time">
                  <Numeric>
                    {formatVenueTime(
                      nextBooking.startsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { hour: "numeric", minute: "2-digit" },
                    )}
                  </Numeric>
                  <small>
                    {formatVenueTime(
                      nextBooking.endsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { hour: "numeric", minute: "2-digit" },
                    )}
                  </small>
                </span>
                <span className="play-day__booking-copy">
                  <Badge tone="positive">{nextBooking.status}</Badge>
                  <strong>{nextBooking.title}</strong>
                  <small>
                    <MapPin aria-hidden size={13} /> {nextBooking.venueName}
                  </small>
                </span>
                <ArrowRight aria-hidden size={19} />
              </div>
            ) : (
              <div className="play-day__empty">
                <span>
                  <CalendarDays aria-hidden size={22} />
                </span>
                <div>
                  <strong>Your day is open.</strong>
                  <p>Reserve a court or host a match for nearby players.</p>
                </div>
                <Link href="/app/discover">See what’s available</Link>
              </div>
            )}
          </div>
        </article>

        <aside className="play-create-card">
          <div className="play-create-card__top">
            <span className="play-create-card__host">
              <span className="avatar">{dashboard.player.initials}</span>
              <span>
                <small>Hosted by you</small>
                <strong>Open a match</strong>
              </span>
            </span>
            <Badge tone={featuredPickup ? "live" : "neutral"}>
              {featuredPickup ? "Live now" : "Quick create"}
            </Badge>
          </div>
          <h2>
            {featuredPickup?.title ??
              "Choose the energy. Duna finds the players."}
          </h2>
          <div className="play-style-preview">
            <span>
              <Trophy aria-hidden size={20} />
              <strong>Competitive</strong>
              <small>Results can move your rating</small>
            </span>
            <span>
              <Sparkles aria-hidden size={20} />
              <strong>Casual</strong>
              <small>Play for fun</small>
            </span>
          </div>
          {featuredPickup && (
            <p>
              {featuredPickup.spotsRemaining} spots remain at{" "}
              {featuredPickup.venueName}.
            </p>
          )}
          <Link
            href={
              featuredPickup
                ? `/events/${featuredPickup.slug}`
                : "/app/pickup/new"
            }
          >
            {featuredPickup ? "Open your match" : "Configure a match"}{" "}
            <ArrowRight aria-hidden size={16} />
          </Link>
        </aside>
      </section>

      {featuredVenue && (
        <section className="play-venue-band">
          <span className="play-venue-band__mark">
            <Building2 aria-hidden size={23} />
          </span>
          <div>
            <span className="page-eyebrow">Book a place to play</span>
            <h2>{featuredVenue.name}</h2>
            <p>
              {featuredVenue.city}, {featuredVenue.region} ·{" "}
              {featuredVenue.courtCount} connected courts
            </p>
          </div>
          <div className="play-venue-band__meta">
            <span>
              <Clock3 aria-hidden size={16} />
              {featuredVenue.openNow ? "Open now" : "See opening hours"}
            </span>
            <Link href={`/app/venues/${featuredVenue.id}`}>
              View court times <ArrowRight aria-hidden size={15} />
            </Link>
          </div>
        </section>
      )}

      <section className="dashboard-section play-nearby">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Matches near you</span>
            <h2>Find an easy yes.</h2>
          </div>
          <Link href="/app/discover">
            Explore all <ArrowRight aria-hidden size={15} />
          </Link>
        </div>
        <div className="play-match-grid">
          {pickups.map((event) => (
            <Link href={`/events/${event.slug}`} key={event.id}>
              <div className="play-match-card__date">
                <small>
                  {
                    formatVenueTime(event.startsAt, event.timezone, "en-US", {
                      weekday: "short",
                    }).split(",")[0]
                  }
                </small>
                <Numeric>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: event.timezone,
                    day: "numeric",
                  }).format(new Date(event.startsAt))}
                </Numeric>
              </div>
              <div className="play-match-card__copy">
                <div>
                  {event.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
                <h3>{event.title}</h3>
                <p>
                  <MapPin aria-hidden size={13} /> {event.venueName}
                </p>
              </div>
              <div className="play-match-card__footer">
                <strong>
                  <Users aria-hidden size={15} />
                  <Numeric>{event.spotsRemaining}</Numeric> spots left
                </strong>
                <span>
                  {event.price.amountMinor
                    ? formatMoney(event.price.amountMinor, event.price.currency)
                    : "Free"}
                </span>
              </div>
              <CheckCircle2 aria-hidden size={19} />
            </Link>
          ))}
          {pickups.length === 0 && (
            <article className="play-nearby__empty">
              <span>
                <Users aria-hidden size={22} />
              </span>
              <h3>Be the first host nearby.</h3>
              <p>
                Pick the match style, level, and price. Share the page when
                you’re ready.
              </p>
              <Link className="secondary-action" href="/app/pickup/new">
                Host a match <ArrowRight aria-hidden size={15} />
              </Link>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
