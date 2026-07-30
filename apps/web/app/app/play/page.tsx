import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Play" };

export default async function PlayPage() {
  const caller = await getServerCaller();
  const dashboard = await caller.player.dashboard();
  const pickups = dashboard.events.filter((event) => event.kind === "pickup");
  const featuredPickup = pickups[0];
  const today = new Date();
  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      day: new Intl.DateTimeFormat("en-US", { weekday: "short" })
        .format(date)
        .toUpperCase(),
      date: String(date.getDate()).padStart(2, "0"),
      active: index === 0,
    };
  });
  return (
    <main className="standard-page">
      <section className="page-heading-row">
        <div>
          <span className="page-eyebrow">Your calendar + community</span>
          <h1>Play.</h1>
          <p>
            Keep every booking, pickup, league night, and court run in one
            place.
          </p>
        </div>
        <Link className="primary-action" href="/app/pickup/new">
          <Plus aria-hidden size={18} /> Host pickup
        </Link>
      </section>

      <section className="play-overview">
        <article className="play-calendar">
          <div className="panel-heading">
            <div>
              <span className="page-eyebrow">Your week</span>
              <h2>
                {dashboard.bookings.length} connected{" "}
                {dashboard.bookings.length === 1 ? "booking" : "bookings"}.
              </h2>
            </div>
            <button aria-label="Add to calendar">
              <CalendarPlus aria-hidden size={18} />
            </button>
          </div>
          <div className="play-calendar__days">
            {calendarDays.map((item) => (
              <div
                className={item.active ? "active" : undefined}
                key={item.day}
              >
                <small>{item.day}</small>
                <Numeric>{item.date}</Numeric>
                {dashboard.bookings.some(
                  (booking) =>
                    new Date(booking.startsAt).toDateString() ===
                    new Date(
                      today.getFullYear(),
                      today.getMonth(),
                      Number(item.date),
                    ).toDateString(),
                ) ? (
                  <span />
                ) : null}
              </div>
            ))}
          </div>
          <div className="booking-list booking-list--large">
            {dashboard.bookings.map((booking) => (
              <Link href="/app/play" key={booking.id}>
                <span className="booking-list__time">
                  <Numeric>
                    {formatVenueTime(
                      booking.startsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { hour: "numeric", minute: "2-digit" },
                    )}
                  </Numeric>
                </span>
                <span>
                  <strong>{booking.title}</strong>
                  <small>
                    <MapPin aria-hidden size={13} /> {booking.venueName}
                  </small>
                </span>
                <Badge tone="positive">{booking.status}</Badge>
              </Link>
            ))}
            {dashboard.bookings.length === 0 && (
              <article className="empty-state">
                <p>No confirmed bookings are connected yet.</p>
              </article>
            )}
          </div>
        </article>

        <aside className="pickup-prompt">
          <span className="pickup-prompt__icon">
            <Users aria-hidden size={24} />
          </span>
          <Badge tone={featuredPickup ? "live" : "neutral"}>
            {featuredPickup
              ? formatVenueTime(
                  featuredPickup.startsAt,
                  featuredPickup.timezone,
                  "en-US",
                  { weekday: "short", minute: "2-digit" },
                )
              : "Host the first run"}
          </Badge>
          <h2>{featuredPickup?.title ?? "Bring your people together."}</h2>
          <p>
            {featuredPickup
              ? `${featuredPickup.spotsRemaining} spots remain at ${featuredPickup.venueName}.`
              : "Create a connected pickup with a real time, location, level, and capacity."}
          </p>
          <div className="avatar-stack">
            <span className="avatar">{dashboard.player.initials}</span>
          </div>
          <Link
            href={
              featuredPickup
                ? `/events/${featuredPickup.slug}`
                : "/app/pickup/new"
            }
          >
            {featuredPickup ? "Open the run" : "Host pickup"}{" "}
            <ArrowRight aria-hidden size={16} />
          </Link>
        </aside>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__heading">
          <div>
            <span className="page-eyebrow">Pickup near you</span>
            <h2>Easy yeses.</h2>
          </div>
          <Link href="/app/discover">
            More nearby <ArrowRight aria-hidden size={15} />
          </Link>
        </div>
        <div className="pickup-list">
          {pickups.map((event) => (
            <Link href={`/events/${event.slug}`} key={event.id}>
              <div className="pickup-list__date">
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
              <div>
                <h3>{event.title}</h3>
                <p>{event.venueName}</p>
              </div>
              <div className="pickup-list__tags">
                {event.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
              <div className="pickup-list__spots">
                <strong>
                  <Numeric>{event.spotsRemaining}</Numeric> left
                </strong>
                <small>
                  {event.price.amountMinor
                    ? formatMoney(event.price.amountMinor, event.price.currency)
                    : "Free"}
                </small>
              </div>
              <CheckCircle2 aria-hidden size={20} />
            </Link>
          ))}
          {pickups.length === 0 && (
            <article className="empty-state">
              <h3>No pickups nearby yet.</h3>
              <p>Publish one in under a minute and share its connected page.</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
