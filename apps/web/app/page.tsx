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
import { AmbientHeroVideo } from "@/components/ambient-hero-video";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

const campaignMedia = {
  rally: "/media/brand/duna-home-hero-v1.webp",
  serve: "/media/duna-action-serve.webp",
  liveRally: "/media/brand/duna-home-rally-v3.webp",
  rating: "/media/brand/duna-rating-texture-v1.webp",
  operator: "/media/brand/duna-club-hero-v1.webp",
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
    <main className="campaign-home" data-zone="editorial">
      <SiteHeader />

      <section className="campaign-hero">
        <div className="campaign-hero__media" aria-hidden>
          <Image alt="" fill priority sizes="100vw" src={campaignMedia.rally} />
          <AmbientHeroVideo />
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
              <Numeric tier="block">{people.length}</Numeric>
              <span>player profiles</span>
            </div>
            <div>
              <Numeric tier="block">{events.length}</Numeric>
              <span>ways to play</span>
            </div>
            <div>
              <Numeric tier="block">{courtCount}</Numeric>
              <span>connected courts</span>
            </div>
          </div>

          <div className="campaign-strand" aria-label="Happening on Duna">
            <span className="campaign-strand__label">
              <Radio aria-hidden size={15} />
              The strand
            </span>
            {events.length > 0 ? (
              events.slice(0, 3).map((event) => (
                <Link href={`/events/${event.slug}`} key={event.id}>
                  <span>{event.live ? "Live now" : "Up next"}</span>
                  <strong>{event.title}</strong>
                  <small>{event.venueName}</small>
                  <ArrowRight aria-hidden size={16} />
                </Link>
              ))
            ) : (
              <Link href="/app/discover">
                <span>Discover</span>
                <strong>Find play near you</strong>
                <small>Courts, clinics, leagues + tournaments</small>
                <ArrowRight aria-hidden size={16} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="campaign-trust">
        <div className="campaign-shell campaign-trust__inner">
          <p>Built for the whole beach.</p>
          <div aria-label="Duna community">
            <span>Players</span>
            <i />
            <span>Coaches</span>
            <i />
            <span>Clubs</span>
          </div>
        </div>
      </section>

      <section className="campaign-shell campaign-intro">
        <div className="campaign-intro__heading">
          <span className="campaign-kicker campaign-kicker--blue">
            The network
          </span>
          <h2>The game finally has a home.</h2>
          <p>
            Duna connects what players do on the sand with everything that makes
            it possible off the court.
          </p>
        </div>

        <div className="campaign-paths">
          <Link href="/app/discover">
            <span className="campaign-paths__role">For players</span>
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
            <span className="campaign-paths__role">For competitors</span>
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
            <span className="campaign-paths__role">For operators</span>
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

      <section className="campaign-live" data-zone="athletic">
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
                    <Numeric tier="block">
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
                    {event.price.amountMinor === 0 ? (
                      <span>Free</span>
                    ) : (
                      <Numeric tier="table">
                        {formatMoney(
                          event.price.amountMinor,
                          event.price.currency,
                          "en-US",
                        )}
                      </Numeric>
                    )}
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
              alt="Two anonymous beach volleyball players in a backlit rally"
              fill
              sizes="(max-width: 900px) 100vw, 48vw"
              src={campaignMedia.liveRally}
            />
            <div className="campaign-live__image-wash" />
            <div className="campaign-live__caption">
              <span>More than a booking.</span>
              <strong>It&apos;s who you meet there.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="campaign-tour" data-zone="athletic">
        <span aria-hidden className="campaign-tour__ghost">
          TOUR
        </span>
        <div className="campaign-shell campaign-tour__inner">
          <div>
            <span className="campaign-kicker">Professional tour</span>
            <h2>The world&apos;s game. One living record.</h2>
            <p>
              Follow professional events, teams, match states, broadcasts, and
              the verified player history behind every result.
            </p>
            <Link className="campaign-button" href="/pro">
              Enter the tour <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
          <div className="campaign-tour__stat">
            <small>Connected profiles</small>
            <Numeric tier="hero">{people.length}</Numeric>
            <span>Ratings, results + form</span>
          </div>
        </div>
      </section>

      <section className="campaign-shell campaign-rating">
        <div className="campaign-rating__image">
          <Image
            alt="Raked beach sand catching warm first light"
            fill
            sizes="(max-width: 900px) 100vw, 44vw"
            src={campaignMedia.rating}
          />
          <div className="campaign-rating__card">
            <RatingOrbit
              compact
              confidence={featuredPlayer?.rating.confidence ?? "Provisional"}
              delta={featuredPlayer?.rating.delta}
              value={featuredPlayer?.rating.display ?? 1}
            />
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
        <div className="campaign-operator__media" aria-hidden>
          <Image alt="" fill sizes="100vw" src={campaignMedia.operator} />
        </div>
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
                <Numeric tier="hero">{events.length}</Numeric> live offers
              </strong>
              <span>{marketNames || "Ready for your first market"}</span>
            </div>
            <div className="campaign-operator__metrics">
              <div>
                <CalendarDays aria-hidden />
                <small>Published sessions</small>
                <Numeric tier="block">{events.length}</Numeric>
              </div>
              <div>
                <Building2 aria-hidden />
                <small>Courts</small>
                <Numeric tier="block">{courtCount}</Numeric>
              </div>
              <div>
                <Users aria-hidden />
                <small>Public profiles</small>
                <Numeric tier="block">{people.length}</Numeric>
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
