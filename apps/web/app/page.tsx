import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  MapPin,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

const campaignMedia = {
  rally: "/media/duna-hero-poster.webp",
  rallyVideo: "/media/duna-hero.mp4",
  serve: "/media/duna-action-serve.webp",
  celebrate: "/media/duna-action-dive.webp",
} as const;

export default async function HomePage() {
  const caller = await getServerCaller();
  const [events, people, venues] = await Promise.all([
    caller.public.events(),
    caller.public.players({ limit: 50 }),
    caller.public.venues(),
  ]);

  const courtCount = venues.reduce(
    (total, venue) => total + venue.courtCount,
    0,
  );
  const featuredEvent = events[0];
  const featuredPlayer = people[0];
  const marketNames = [...new Set(venues.map((venue) => venue.city))]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="campaign-home">
      <SiteHeader />

      <section className="campaign-hero">
        <div className="campaign-hero__media" aria-hidden>
          <Image alt="" fill priority sizes="100vw" src={campaignMedia.rally} />
          <video
            autoPlay
            className="campaign-hero__video"
            loop
            muted
            playsInline
            poster={campaignMedia.rally}
            preload="metadata"
          >
            <source src={campaignMedia.rallyVideo} type="video/mp4" />
          </video>
          <div className="campaign-hero__wash" />
          <div className="campaign-hero__grain" />
        </div>

        <div className="campaign-shell campaign-hero__content">
          <div className="campaign-hero__copy">
            <span className="campaign-kicker">
              <span />
              The home of your game
            </span>
            <h1>
              Play more.
              <br />
              <em>Know your game.</em>
            </h1>
            <p>
              Find courts and people, book, compete, and carry every verified
              result with you. Duna puts the whole beach in one place.
            </p>
            <div className="campaign-hero__actions">
              <Link
                className="campaign-button campaign-button--light"
                href="/app"
              >
                Find your next game <ArrowRight aria-hidden size={18} />
              </Link>
              <Link
                className="campaign-button campaign-button--glass"
                href="/run-your-club"
              >
                Run your club
              </Link>
            </div>
          </div>

          <div className="campaign-hero__proof" aria-label="Duna network">
            <div>
              <Numeric>{people.length}</Numeric>
              <span>player profiles</span>
            </div>
            <div>
              <Numeric>{events.length}</Numeric>
              <span>ways to play</span>
            </div>
            <div>
              <Numeric>{courtCount}</Numeric>
              <span>connected courts</span>
            </div>
          </div>

          <Link
            className="campaign-now"
            href={
              featuredEvent ? `/events/${featuredEvent.slug}` : "/app/discover"
            }
          >
            <span className="campaign-now__status">
              <Radio aria-hidden size={15} />
              {featuredEvent?.live ? "Live now" : "Up next"}
            </span>
            <span className="campaign-now__title">
              <strong>
                {featuredEvent?.title ?? "Discover play near you"}
              </strong>
              <small>
                {featuredEvent
                  ? `${featuredEvent.venueName} · ${featuredEvent.spotsRemaining} spots`
                  : "Courts, clinics, pickups, leagues + tournaments"}
              </small>
            </span>
            <span className="campaign-now__arrow">
              <ArrowRight aria-hidden size={18} />
            </span>
          </Link>
        </div>
      </section>

      <section className="campaign-trust">
        <div className="campaign-shell campaign-trust__inner">
          <p>Backed by beach volleyball&apos;s best.</p>
          <div aria-label="Athlete backers">
            <span>Phil Dalhausser</span>
            <i />
            <span>Taylor Crabb</span>
            <i />
            <span>Taylor Sander</span>
          </div>
        </div>
      </section>

      <section className="campaign-shell campaign-intro">
        <div className="campaign-intro__heading">
          <span className="campaign-kicker campaign-kicker--blue">
            One network. Every side of the sport.
          </span>
          <h2>The game finally has a home.</h2>
          <p>
            Duna connects what players do on the sand with everything that makes
            it possible off the court.
          </p>
        </div>

        <div className="campaign-paths">
          <Link href="/app/discover">
            <span className="campaign-paths__number">01</span>
            <span className="campaign-paths__icon">
              <CalendarDays aria-hidden />
            </span>
            <h3>Find what&apos;s next.</h3>
            <p>
              Courts, pickups, coaching, clinics, leagues, and tournaments—one
              search, shaped around your city and level.
            </p>
            <span className="campaign-paths__link">
              Explore play <ArrowRight aria-hidden size={16} />
            </span>
          </Link>
          <Link href="/app/profile">
            <span className="campaign-paths__number">02</span>
            <span className="campaign-paths__icon">
              <ChartNoAxesCombined aria-hidden />
            </span>
            <h3>Know how you&apos;re moving.</h3>
            <p>
              Your Sand Rating reads opponents, partners, scores, and
              verification—not just who walked away with the win.
            </p>
            <span className="campaign-paths__link">
              See your rating <ArrowRight aria-hidden size={16} />
            </span>
          </Link>
          <Link href="/run-your-club">
            <span className="campaign-paths__number">03</span>
            <span className="campaign-paths__icon">
              <Building2 aria-hidden />
            </span>
            <h3>Run the whole operation.</h3>
            <p>
              Scheduling, payments, memberships, events, people, courts, and
              messaging—simple enough to run between sessions.
            </p>
            <span className="campaign-paths__link">
              Meet Duna HQ <ArrowRight aria-hidden size={16} />
            </span>
          </Link>
        </div>
      </section>

      <section className="campaign-live">
        <div className="campaign-shell campaign-live__grid">
          <div className="campaign-live__copy">
            <span className="campaign-kicker campaign-kicker--sand">
              Happening on Duna
            </span>
            <h2>Your next yes is closer than you think.</h2>
            <p>
              A live window into the real courts, people, and competition
              already connected to Duna.
            </p>

            <div className="campaign-event-list">
              {events.slice(0, 3).map((event) => (
                <Link href={`/events/${event.slug}`} key={event.id}>
                  <span className="campaign-event-list__date">
                    <small>
                      {formatVenueTime(
                        event.startsAt,
                        event.timezone,
                        "en-US",
                        {
                          month: "short",
                          day: undefined,
                          hour: undefined,
                          minute: undefined,
                        },
                      )}
                    </small>
                    <Numeric>
                      {formatVenueTime(
                        event.startsAt,
                        event.timezone,
                        "en-US",
                        {
                          month: undefined,
                          day: "2-digit",
                          hour: undefined,
                          minute: undefined,
                        },
                      )}
                    </Numeric>
                  </span>
                  <span className="campaign-event-list__body">
                    <span>
                      {event.live && <Badge tone="live">Live</Badge>}
                      <small>
                        {event.kind.replace("-", " ")} ·{" "}
                        {formatVenueTime(
                          event.startsAt,
                          event.timezone,
                          "en-US",
                          { month: undefined, day: undefined },
                        )}
                      </small>
                    </span>
                    <strong>{event.title}</strong>
                    <small>
                      <MapPin aria-hidden size={13} />
                      {event.venueName}
                    </small>
                  </span>
                  <span className="campaign-event-list__meta">
                    <Numeric>
                      {event.price.amountMinor === 0
                        ? "Free"
                        : formatMoney(
                            event.price.amountMinor,
                            event.price.currency,
                            "en-US",
                          )}
                    </Numeric>
                    <small>{event.spotsRemaining} spots</small>
                  </span>
                  <span className="campaign-event-list__arrow">
                    <ArrowRight aria-hidden size={17} />
                  </span>
                </Link>
              ))}
              {events.length === 0 && (
                <div className="campaign-event-list__empty">
                  Published play will appear here as clubs come online.
                </div>
              )}
            </div>

            <Link className="campaign-text-link" href="/app/discover">
              Explore everything <ArrowRight aria-hidden size={16} />
            </Link>
          </div>

          <div className="campaign-live__image">
            <Image
              alt="Elite beach volleyball players celebrating together after a point"
              fill
              sizes="(max-width: 900px) 100vw, 48vw"
              src={campaignMedia.celebrate}
            />
            <div className="campaign-live__image-wash" />
            <div className="campaign-live__caption">
              <span>More than a booking.</span>
              <strong>It&apos;s who you meet there.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="campaign-shell campaign-rating">
        <div className="campaign-rating__image">
          <Image
            alt="Elite beach volleyball player rising for a jump serve"
            fill
            sizes="(max-width: 900px) 100vw, 44vw"
            src={campaignMedia.serve}
          />
          <div className="campaign-rating__card">
            <RatingOrbit
              compact
              confidence={featuredPlayer?.rating.confidence ?? "Provisional"}
              delta={featuredPlayer?.rating.delta}
              value={featuredPlayer?.rating.display ?? 1}
            />
            <span>
              <small>Sand Rating</small>
              <strong>
                {featuredPlayer?.rating.display.toFixed(2) ?? "—"}
              </strong>
              <em>
                {featuredPlayer?.rating.confidence ?? "Provisional"} confidence
              </em>
            </span>
          </div>
        </div>

        <div className="campaign-rating__copy">
          <span className="campaign-kicker campaign-kicker--blue">
            Your game, made visible
          </span>
          <h2>A rating that moves when your game does.</h2>
          <p>
            Duna reads the whole result: who you played, who stood beside you,
            every score, and how the match was verified. Then it shows you why
            you moved.
          </p>
          <div className="campaign-rating__principles">
            <div>
              <ShieldCheck aria-hidden />
              <span>
                <strong>Verified, not self-declared.</strong>
                Results build a portable history you can trust.
              </span>
            </div>
            <div>
              <Users aria-hidden />
              <span>
                <strong>Made for partners.</strong>
                Opponent and teammate strength both matter.
              </span>
            </div>
            <div>
              <Trophy aria-hidden />
              <span>
                <strong>Performance over trophies.</strong>
                Close matches against better competition count.
              </span>
            </div>
          </div>
          <Link className="campaign-text-link" href="/methodology">
            How Sand Rating works <ArrowRight aria-hidden size={16} />
          </Link>
        </div>
      </section>

      <section className="campaign-operator">
        <div className="campaign-shell campaign-operator__grid">
          <div className="campaign-operator__copy">
            <Badge>For clubs, coaches + facilities</Badge>
            <h2>Your business should feel as fluid as your game.</h2>
            <p>
              Duna HQ keeps the advanced work behind the scenes and gives
              operators one clear place to schedule, sell, communicate, and
              grow.
            </p>
            <div className="campaign-operator__actions">
              <Link
                className="campaign-button campaign-button--blue"
                href="/run-your-club"
              >
                Run your club on Duna <ArrowRight aria-hidden size={17} />
              </Link>
              <Link className="campaign-text-link" href="/create">
                Create an event
              </Link>
            </div>
          </div>

          <div className="campaign-operator__product">
            <div className="campaign-operator__bar">
              <span>DUNA HQ</span>
              <Badge tone="positive">Connected</Badge>
            </div>
            <div className="campaign-operator__metric campaign-operator__metric--hero">
              <small>One connected business</small>
              <strong>
                <Numeric>{events.length}</Numeric> live offers
              </strong>
              <span>{marketNames || "Ready for your first market"}</span>
            </div>
            <div className="campaign-operator__metrics">
              <div>
                <CalendarDays aria-hidden />
                <small>Published sessions</small>
                <Numeric>{events.length}</Numeric>
              </div>
              <div>
                <Building2 aria-hidden />
                <small>Courts</small>
                <Numeric>{courtCount}</Numeric>
              </div>
              <div>
                <Users aria-hidden />
                <small>Public profiles</small>
                <Numeric>{people.length}</Numeric>
              </div>
            </div>
            <div className="campaign-operator__insight">
              <span>
                <Sparkles aria-hidden size={17} />
              </span>
              <p>
                <small>Duna AI · Today</small>
                <strong>
                  {featuredEvent
                    ? `${featuredEvent.title} has ${featuredEvent.spotsRemaining} spots left.`
                    : "Your first event can be live in minutes."}
                </strong>
              </p>
              <ArrowRight aria-hidden size={17} />
            </div>
          </div>
        </div>
      </section>

      <section className="campaign-closing">
        <div className="campaign-shell campaign-closing__inner">
          <span className="campaign-kicker">The court is waiting</span>
          <h2>There&apos;s always another game.</h2>
          <p>Find yours. Bring the whole history with you.</p>
          <Link className="campaign-button campaign-button--light" href="/app">
            Enter Duna <ArrowRight aria-hidden size={18} />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
