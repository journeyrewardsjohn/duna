import { demoBookings, demoEvents } from "@duna/core/demo";
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

export const metadata = { title: "Play" };

export default function PlayPage() {
  const pickups = demoEvents.filter((event) => event.kind === "pickup");
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
              <h2>Three reasons to get sandy.</h2>
            </div>
            <button aria-label="Add to calendar">
              <CalendarPlus aria-hidden size={18} />
            </button>
          </div>
          <div className="play-calendar__days">
            {[
              ["MON", "27"],
              ["TUE", "28"],
              ["WED", "29"],
              ["THU", "30"],
              ["FRI", "31"],
              ["SAT", "01"],
              ["SUN", "02"],
            ].map(([day, date], index) => (
              <div className={index === 3 ? "active" : undefined} key={day}>
                <small>{day}</small>
                <Numeric>{date}</Numeric>
                {index === 3 || index === 4 || index === 5 ? <span /> : null}
              </div>
            ))}
          </div>
          <div className="booking-list booking-list--large">
            {demoBookings.map((booking) => (
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
          </div>
        </article>

        <aside className="pickup-prompt">
          <span className="pickup-prompt__icon">
            <Users aria-hidden size={24} />
          </span>
          <Badge tone="live">Tonight · 6:00 PM</Badge>
          <h2>Your regular crew is almost full.</h2>
          <p>
            Theo, Noa, and Elena are in. Two spots remain at Golden Hour 4s.
          </p>
          <div className="avatar-stack">
            {["TP", "NW", "ET", "+2"].map((value) => (
              <span className="avatar" key={value}>
                {value}
              </span>
            ))}
          </div>
          <Link href="/events/golden-hour-fours">
            Join the run <ArrowRight aria-hidden size={16} />
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
          {[...pickups, demoEvents[3]!, demoEvents[2]!].map((event) => (
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
        </div>
      </section>
    </main>
  );
}
