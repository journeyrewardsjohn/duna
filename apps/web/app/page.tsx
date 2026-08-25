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
  Star,
  Trophy,
  Users,
  Video,
  Watch as WatchIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { DunaWatchDevice } from "@/components/duna-watch-device";
import { ProfileAvatarStack } from "@/components/profile-avatar-stack";
import { PredictionDiscoverySection } from "@/components/prediction-discovery";
import { RatingOrbit } from "@/components/rating-orbit";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import {
  marketingPeople,
  marketingPlayerGroup,
  withDemoProfileAvatars,
} from "@/lib/marketing-people";
import styles from "./homepage.module.css";

const homeMedia = {
  hero: "/media/duna-hero-poster.webp",
  rally: "/media/brand/duna-home-rally-v3.webp",
  operator: "/media/brand/duna-club-hero-v1.webp",
} as const;

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    types: { "text/markdown": "/index.md" },
  },
};

export default async function HomePage() {
  const caller = await getServerCaller();
  const [events, people, venues, predictionDiscovery] = await Promise.all([
    caller.public.events(),
    caller.public.players({ limit: 50 }),
    caller.public.venues(),
    caller.public.predictionDiscovery({ limit: 3 }),
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
  const tickerItems = [
    ...events
      .slice(0, 4)
      .map((event) =>
        event.live
          ? `${event.title.toUpperCase()} — LIVE NOW`
          : `${event.title.toUpperCase()} — ${event.spotsRemaining} SPOTS OPEN`,
      ),
    ...venues
      .slice(0, 4)
      .map(
        (venue) =>
          `${venue.city.toUpperCase()} — ${venue.courtCount} ${venue.courtCount === 1 ? "COURT" : "COURTS"} CONNECTED`,
      ),
  ];

  return (
    <main className={`campaign-home ${styles.home}`} data-zone="editorial">
      <SiteHeader />

      <section aria-labelledby="home-hero-heading" className={styles.hero}>
        <div className={styles.shell}>
          {featuredEvent ? (
            <Link
              className={styles.heroAnnouncement}
              href={`/events/${featuredEvent.slug}`}
            >
              <span>{featuredEvent.live ? "Live" : "Up next"}</span>
              {featuredEvent.title}
              <b aria-hidden>→</b>
            </Link>
          ) : null}

          <div className={styles.heroCopy}>
            <h1 id="home-hero-heading">The sand keeps score now.</h1>
            <p>
              Find a game tonight, get one verified rating, and watch every
              court worth watching.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/discover">
                Find a game
              </Link>
              <Link className={styles.secondaryAction} href="/sign-up">
                Claim your rating
              </Link>
            </div>
          </div>

          <div className={styles.heroMedia}>
            <Image
              alt="Beach volleyball players competing on a packed center court"
              fill
              priority
              sizes="(max-width: 1280px) calc(100vw - 48px), 1216px"
              src={homeMedia.hero}
            />
            <div className={styles.heroLive}>
              <i />
              {featuredEvent?.live ? "Live" : "On the sand"} ·{" "}
              {featuredEvent?.venueName ?? "Every connected court"}
            </div>
            <div className={styles.heroRating}>
              <span>Sand Rating</span>
              <strong>{featuredPlayer?.rating.display ?? 1}</strong>
              <small>
                {featuredPlayer?.rating.confidence ?? "Provisional"} ·{" "}
                {people.length} connected players
              </small>
            </div>
          </div>

          <div className={styles.heroProof} aria-label="Duna network">
            <div>
              <Numeric tier="block">{people.length}</Numeric>
              <span>connected players</span>
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
        </div>
      </section>

      {tickerItems.length > 0 ? (
        <div
          aria-label={tickerItems.join(". ")}
          className={styles.ticker}
          role="status"
        >
          <div aria-hidden className={styles.tickerTrack}>
            {[0, 1].map((segment) => (
              <span className={styles.tickerSegment} key={segment}>
                {tickerItems.map((item, itemIndex) => (
                  <span key={`${segment}-${itemIndex}`}>
                    {item} <i>●</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.featureStack}>
        <section
          aria-labelledby="home-play-heading"
          className={`${styles.featureBand} ${styles.playBand}`}
        >
          <div className={`${styles.shell} ${styles.chapterLayout}`}>
            <div className={styles.chapterCopy}>
              <span className={styles.eyebrow}>Play</span>
              <h2 id="home-play-heading">The next game is already moving.</h2>
              <p>
                Search courts, pickups, coaching, clinics, leagues, and
                tournaments around your city and level. Book without leaving the
                network.
              </p>
              <Link className={styles.primaryAction} href="/discover">
                Explore what&apos;s next
              </Link>
            </div>

            <Link
              className={styles.chapterSignal}
              href={
                featuredEvent ? `/events/${featuredEvent.slug}` : "/discover"
              }
            >
              <span>
                <Radio aria-hidden size={15} />
                {featuredEvent?.live ? "Live now" : "Up next"}
              </span>
              <strong>{featuredEvent?.title ?? "Find play near you"}</strong>
              <small>
                {featuredEvent?.venueName ?? "Courts, people, and competition"}
              </small>
              {featuredEvent?.attendees &&
              featuredEvent.attendees.length > 0 ? (
                <div className={styles.chapterAttendance}>
                  <ProfileAvatarStack
                    label={`${featuredEvent.attendees.length} people attending ${featuredEvent.title}`}
                    people={withDemoProfileAvatars(featuredEvent.attendees)}
                    size="sm"
                  />
                  <small>{featuredEvent.attendees.length} going</small>
                </div>
              ) : null}
              <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="home-record-heading"
          className={`${styles.featureBand} ${styles.recordBand}`}
        >
          <div className={`${styles.shell} ${styles.chapterLayout}`}>
            <div className={styles.ratingSignal}>
              <span>Sand Rating</span>
              <Numeric tier="hero">
                {featuredPlayer?.rating.display ?? 1}
              </Numeric>
              <small>
                {featuredPlayer?.rating.confidence ?? "Provisional"} · every
                result explained
              </small>
            </div>

            <div className={styles.chapterCopy}>
              <span className={styles.eyebrow}>Compete</span>
              <h2 id="home-record-heading">Every point becomes proof.</h2>
              <p>
                Partners, opponents, scores, and verification become one
                portable performance history—so your rating moves when your game
                does.
              </p>
              <Link className={styles.primaryAction} href="/methodology">
                See how Sand Rating works
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="home-operate-heading"
          className={`${styles.featureBand} ${styles.operateBand}`}
        >
          <div className={`${styles.shell} ${styles.chapterLayout}`}>
            <div className={styles.chapterCopy}>
              <span className={styles.eyebrow}>Operate</span>
              <h2 id="home-operate-heading">The whole club, in motion.</h2>
              <p>
                Scheduling, payments, memberships, events, people, courts, and
                messaging share one operational picture—clear enough to run
                between sessions.
              </p>
              <Link className={styles.primaryAction} href="/run-your-club">
                Meet Duna HQ
              </Link>
            </div>

            <div className={styles.operatorSignal}>
              <span>Duna HQ</span>
              <div>
                <small>Published sessions</small>
                <Numeric tier="block">{events.length}</Numeric>
              </div>
              <div>
                <small>Connected courts</small>
                <Numeric tier="block">{courtCount}</Numeric>
              </div>
              <p>
                <i /> Connected · {marketNames || "ready for your first market"}
              </p>
              <section className={styles.operatorPeople}>
                <ProfileAvatarStack
                  label="Players connected to today's sessions"
                  people={marketingPlayerGroup}
                  size="sm"
                />
                <span>
                  <strong>Players connected</strong>
                  <small>Profiles follow every booking</small>
                </span>
              </section>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="home-now-heading" className={styles.nowSection}>
        <div className={`${styles.shell} ${styles.sectionHeading}`}>
          <span className={styles.eyebrow}>Now on Duna</span>
          <h2 id="home-now-heading">See the game while it&apos;s happening.</h2>
          <p>
            A live window into real courts, people, and competition already
            connected to the same record.
          </p>
        </div>

        <div className={`${styles.shell} ${styles.nowGrid}`}>
          <div className={styles.eventList}>
            {events.slice(0, 3).map((event) => (
              <Link href={`/events/${event.slug}`} key={event.id}>
                <span className={styles.eventDate}>
                  <small>
                    {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                      month: "short",
                      day: undefined,
                      hour: undefined,
                      minute: undefined,
                    })}
                  </small>
                  <Numeric tier="block">
                    {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                      month: undefined,
                      day: "2-digit",
                      hour: undefined,
                      minute: undefined,
                    })}
                  </Numeric>
                </span>
                <span className={styles.eventBody}>
                  <span>
                    {event.live && <Badge tone="live">Live</Badge>}
                    <small>{event.kind.replace("-", " ")}</small>
                  </span>
                  <strong>{event.title}</strong>
                  <small>
                    <MapPin aria-hidden size={13} /> {event.venueName}
                  </small>
                  {event.attendees && event.attendees.length > 0 && (
                    <div className={styles.eventAttendance}>
                      <ProfileAvatarStack
                        label={`${event.attendees.length} people attending ${event.title}`}
                        people={withDemoProfileAvatars(event.attendees)}
                        size="sm"
                      />
                      <small>{event.attendees.length} going</small>
                    </div>
                  )}
                </span>
                <span className={styles.eventMeta}>
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
                <ArrowRight aria-hidden size={17} />
              </Link>
            ))}
            {events.length === 0 && (
              <div className={styles.eventEmpty}>
                Published play will appear here as clubs come online.
              </div>
            )}
            <Link className={styles.textLink} href="/discover">
              Explore everything <ArrowRight aria-hidden size={17} />
            </Link>
          </div>

          <div className={styles.rallyFrame}>
            <Image
              alt="Two anonymous beach volleyball players moving through a backlit rally"
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
              src={homeMedia.rally}
            />
            <div className={styles.rallyVeil} />
            <div className={styles.rallyCaption}>
              <span>The Strand</span>
              <strong>Every court becomes part of the network.</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.predictionsSection}>
        <div className={`${styles.shell} homepage-predictions`}>
          <PredictionDiscoverySection
            allHref="/pro"
            description="Make your call on live and upcoming beach volleyball with free-play credits. Crowd prices move with every matched position."
            discovery={predictionDiscovery}
            publicMode
            title="What happens next?"
          />
        </div>
      </section>

      <section
        aria-labelledby="home-intelligence-heading"
        className={styles.intelligenceSection}
      >
        <div className={`${styles.shell} ${styles.intelligenceGrid}`}>
          <div className={styles.ratingPanel}>
            <span className={styles.eyebrow}>Performance intelligence</span>
            <div className={styles.ratingOrbitWrap} aria-hidden="true">
              <RatingOrbit
                compact
                confidence={featuredPlayer?.rating.confidence ?? "Provisional"}
                delta={featuredPlayer?.rating.delta}
                value={featuredPlayer?.rating.display ?? 1}
              />
            </div>
            <h2 id="home-intelligence-heading">
              A record that travels with you.
            </h2>
            <p>
              Duna reads the whole result, explains the movement, and keeps the
              evidence attached to the player—not trapped inside one league.
            </p>
            <div className={styles.principles}>
              <div>
                <ShieldCheck aria-hidden />
                <span>
                  <strong>Verified</strong>
                  Evidence, not self-declaration.
                </span>
              </div>
              <div>
                <Users aria-hidden />
                <span>
                  <strong>Partner-aware</strong>
                  Teammate and opponent strength matter.
                </span>
              </div>
              <div>
                <Trophy aria-hidden />
                <span>
                  <strong>Performance-led</strong>
                  The quality of the match matters.
                </span>
              </div>
            </div>
          </div>

          <div className={styles.tourPanel}>
            <span aria-hidden className={styles.tourGhost}>
              TOUR
            </span>
            <span className={styles.eyebrow}>Professional game</span>
            <h2>The world tour, one living record.</h2>
            <p>
              Follow events, teams, match states, broadcasts, and the verified
              player history behind every result.
            </p>
            <div className={styles.tourStat}>
              <Numeric tier="hero">{people.length}</Numeric>
              <span>connected player profiles</span>
            </div>
            <Link className={styles.primaryAction} href="/pro">
              Enter the tour <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="home-watch-heading"
        className={styles.watchSection}
        data-zone="live"
      >
        <div className={`${styles.shell} ${styles.watchGrid}`}>
          <div className={styles.watchCopy}>
            <span className={styles.liveEyebrow}>
              <Radio aria-hidden size={14} /> Live match control
            </span>
            <h2 id="home-watch-heading">The match is on your wrist.</h2>
            <p>
              Score every rally with one hand. Check live camera framing, flag
              the last rally, and keep the Watch, match, source video, and final
              record on one timeline.
            </p>
            <div className={styles.watchFeatures}>
              <div>
                <WatchIcon aria-hidden />
                <span>
                  <strong>Score in motion</strong>
                  One-handed gestures between rallies.
                </span>
              </div>
              <div>
                <Video aria-hidden />
                <span>
                  <strong>See the setup that matters</strong>
                  The paired iPhone confirms real court evidence before it draws
                  a court guide.
                </span>
              </div>
              <div>
                <Star aria-hidden />
                <span>
                  <strong>Flag the last rally</strong>
                  Send a coaching-review cue without leaving court.
                </span>
              </div>
            </div>
            <Link className={styles.liveAction} href="/apps/apple-watch">
              Explore Duna for Apple Watch <ArrowRight aria-hidden size={18} />
            </Link>
          </div>

          <div className={styles.watchVisual}>
            <div aria-hidden className={styles.watchRings} />
            <DunaWatchDevice
              className={styles.watchDevice}
              label="Duna source-linked last-rally review cue on Apple Watch"
              screen="review"
            />
            <div className={styles.watchStatus}>
              <i />
              <span>
                <small>Duna Vision</small>
                Score synced · 17–14
              </span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="home-hq-heading" className={styles.hqSection}>
        <div className={`${styles.shell} ${styles.hqGrid}`}>
          <div className={styles.hqCopy}>
            <span className={styles.eyebrow}>
              For clubs, coaches + facilities
            </span>
            <h2 id="home-hq-heading">Run the business. Keep the game human.</h2>
            <p>
              Duna HQ puts the advanced work behind the scenes and gives your
              team one clear place to schedule, sell, communicate, and grow.
              Permissioned Duna Vision review, court maps, and source-linked
              replays keep coaching evidence beside the player—not in a separate
              video silo.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/run-your-club">
                Run your club on Duna <ArrowRight aria-hidden size={17} />
              </Link>
              <Link className={styles.textLink} href="/create">
                Create an event
              </Link>
            </div>
          </div>

          <div className={styles.hqProduct}>
            <div className={styles.hqImage} aria-hidden="true">
              <Image
                fill
                sizes="(max-width: 900px) 100vw, 45vw"
                src={homeMedia.operator}
                alt=""
              />
              <div />
            </div>
            <div className={styles.hqConsole}>
              <div className={styles.hqBar}>
                <span>Duna HQ</span>
                <Badge tone="positive">Connected</Badge>
              </div>
              <div className={styles.hqMetrics}>
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
                  <ChartNoAxesCombined aria-hidden />
                  <small>Public profiles</small>
                  <Numeric tier="block">{people.length}</Numeric>
                </div>
              </div>
              <div className={styles.hqPeople}>
                <ProfileAvatarStack
                  label="Players scheduled across today's Duna HQ sessions"
                  people={[
                    marketingPeople.maya,
                    marketingPeople.jamie,
                    marketingPeople.mara,
                    marketingPeople.noa,
                    marketingPeople.theo,
                  ]}
                  size="sm"
                />
                <p>
                  <strong>Seven arrivals confirmed</strong>
                  <small>Private lessons + group training</small>
                </p>
              </div>
              <div className={styles.hqInsight}>
                <Sparkles aria-hidden size={17} />
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
        </div>
      </section>

      <section className={styles.closingSection}>
        <div className={`${styles.shell} ${styles.closingInner}`}>
          <span className={styles.eyebrow}>The court is waiting</span>
          <h2>There&apos;s always another game.</h2>
          <p>Find yours. Bring the whole history with you.</p>
          <Link className={styles.primaryAction} href="/discover">
            Enter Duna <ArrowRight aria-hidden size={18} />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
