import {
  defaultEventMedia,
  formatVenueTime,
  type EventSummary,
} from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { MatchCard } from "@/components/match-card";
import { RatingOrbit } from "@/components/rating-orbit";
import { getServerCaller } from "@/lib/api";
import styles from "./player-dashboard.module.css";

const bookingEventMatchWindow = 15 * 60 * 1000;

function mediaForEvent(event: EventSummary) {
  return (
    event.media?.find((item) => item.kind === "image")?.url ??
    event.imageUrl ??
    defaultEventMedia(event.kind, event.id).path
  );
}

export default async function PlayerDashboard() {
  const caller = await getServerCaller();
  const [dashboard, settings] = await Promise.all([
    caller.player.dashboard(),
    caller.player.settings(),
  ]);
  const { player } = dashboard;
  const now = Date.now();
  const futureEvents = dashboard.events
    .filter(
      (event) =>
        event.lifecycleStatus !== "cancelled" &&
        new Date(event.endsAt).getTime() > now,
    )
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  const futureBookings = dashboard.bookings
    .filter((booking) => new Date(booking.endsAt).getTime() > now)
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  const nextBooking = futureBookings[0];
  const bookedEvent = nextBooking
    ? futureEvents.find(
        (event) =>
          event.kind === nextBooking.kind &&
          event.venueName === nextBooking.venueName &&
          Math.abs(
            new Date(event.startsAt).getTime() -
              new Date(nextBooking.startsAt).getTime(),
          ) < bookingEventMatchWindow,
      )
    : undefined;
  const hostedEvent = futureEvents.find(
    (event) => event.host?.id === player.id,
  );
  const nextPersonalEvent =
    bookedEvent ?? (!nextBooking ? hostedEvent : undefined);
  const nextPersonal = nextBooking ?? nextPersonalEvent;
  const nextStartsAt = nextBooking?.startsAt ?? nextPersonalEvent?.startsAt;
  const nextTimezone = nextPersonalEvent?.timezone ?? "America/Los_Angeles";
  const nextKind = nextBooking?.kind ?? nextPersonalEvent?.kind ?? "pickup";
  const nextImage = nextPersonalEvent
    ? mediaForEvent(nextPersonalEvent)
    : defaultEventMedia(nextKind, nextBooking?.id ?? player.id).path;
  const nextHref = nextPersonalEvent
    ? `/events/${nextPersonalEvent.slug}`
    : nextBooking
      ? "/app/play"
      : "/app/discover";
  const latestMatch = dashboard.recentMatches[0];
  const firstName = player.displayName.split(" ")[0] ?? player.displayName;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const quickActions = [
    {
      href: "/app/discover",
      icon: Search,
      label: "Find play",
      detail: "Matches and events nearby",
    },
    {
      href: "/app/play",
      icon: CalendarDays,
      label: "Book a court",
      detail: "See live availability",
    },
    {
      href: "/app/pickup/new",
      icon: CalendarPlus,
      label: "Host pickup",
      detail: "Set the time and invite players",
    },
    {
      href: "/app/score",
      icon: Plus,
      label: "Record a match",
      detail: "Add a result or score live",
    },
  ] as const;

  return (
    <main className={styles.home}>
      <header className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>{dateLabel}</span>
          <h1>Ready to play, {firstName}?</h1>
          <p>Your next game, nearby play, and recent form—without the noise.</p>
        </div>
        <Link className={styles.historyLink} href="/app/matches">
          <Trophy aria-hidden size={18} /> Match history
        </Link>
      </header>

      <nav aria-label="Player quick actions" className={styles.quickActions}>
        {quickActions.map(({ detail, href, icon: Icon, label }, index) => (
          <Link
            className={
              index === 0 ? styles.quickActionPrimary : styles.quickAction
            }
            href={href}
            key={href}
          >
            <span className={styles.quickActionIcon}>
              <Icon aria-hidden size={21} />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <ArrowRight
              aria-hidden
              className={styles.quickActionArrow}
              size={17}
            />
          </Link>
        ))}
      </nav>

      {settings.profile.onboardingStatus !== "complete" && (
        <Link className={styles.profilePrompt} href="/app/onboarding">
          <span className={styles.profilePromptIcon}>
            <Sparkles aria-hidden size={20} />
          </span>
          <span>
            <small>Finish your player profile</small>
            <strong>Personalize discovery, ratings, and match context.</strong>
          </span>
          <span>
            Continue setup <ArrowRight aria-hidden size={16} />
          </span>
        </Link>
      )}

      <section className={styles.todayGrid} aria-label="Your day">
        <Link className={styles.nextUp} href={nextHref}>
          <div className={styles.nextUpMedia}>
            <img
              alt={
                nextPersonal
                  ? `${nextPersonal.title} event poster`
                  : "Beach volleyball at golden hour"
              }
              src={nextImage}
            />
            <div className={styles.nextUpMediaTopline}>
              <Badge
                tone={
                  nextBooking?.status === "needs-action"
                    ? "warning"
                    : "positive"
                }
              >
                {nextBooking?.status === "needs-action"
                  ? "Action needed"
                  : nextPersonal
                    ? "Confirmed"
                    : "Calendar open"}
              </Badge>
              <span>{nextKind.replace("-", " ")}</span>
            </div>
          </div>
          <div className={styles.nextUpBody}>
            <span className={styles.eyebrow}>Next up</span>
            <div className={styles.nextUpHeading}>
              <div className={styles.nextUpDate}>
                {nextStartsAt ? (
                  <>
                    <span>
                      {formatVenueTime(nextStartsAt, nextTimezone, "en-US", {
                        month: "short",
                      })}
                    </span>
                    <Numeric tier="block">
                      {formatVenueTime(nextStartsAt, nextTimezone, "en-US", {
                        day: "numeric",
                      })}
                    </Numeric>
                  </>
                ) : (
                  <Plus aria-hidden size={24} />
                )}
              </div>
              <div>
                <h2>{nextPersonal?.title ?? "Your calendar is open."}</h2>
                <p>
                  {nextStartsAt
                    ? formatVenueTime(nextStartsAt, nextTimezone, "en-US", {
                        weekday: "long",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Find a match, court, or event worth playing."}
                </p>
              </div>
            </div>
            <div className={styles.nextUpFooter}>
              <span>
                <MapPin aria-hidden size={17} />
                {nextPersonal?.venueName ?? "Explore play near you"}
              </span>
              <strong>
                {nextPersonal ? "Open details" : "Find play"}
                <ChevronRight aria-hidden size={17} />
              </strong>
            </div>
          </div>
        </Link>

        <article className={styles.ratingCard}>
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.eyebrow}>Your performance</span>
              <h2>Sand Rating</h2>
            </div>
            <Badge tone="positive">{player.rating.confidence}</Badge>
          </div>
          <div className={styles.ratingBody}>
            <RatingOrbit
              compact
              confidence={player.rating.confidence}
              delta={player.rating.delta}
              value={player.rating.display}
            />
            <div className={styles.ratingInsight}>
              <small>{latestMatch ? "Latest movement" : "Rating state"}</small>
              <strong>
                {latestMatch
                  ? `${latestMatch.ratingDelta > 0 ? "+" : ""}${latestMatch.ratingDelta.toFixed(2)} after your latest verified result.`
                  : "Your connected results will shape this rating."}
              </strong>
              <Link href="/app/matches">
                See the results <ArrowRight aria-hidden size={15} />
              </Link>
            </div>
          </div>
          <div className={styles.ratingStats}>
            <span>
              <small>Home market</small>
              <strong>{player.homeMarket.split(",")[0]}</strong>
            </span>
            <span>
              <small>Recent matches</small>
              <Numeric tier="table">{dashboard.recentMatches.length}</Numeric>
            </span>
            <span>
              <small>Wallet</small>
              <Numeric tier="table">
                ${(dashboard.walletBalanceMinor / 100).toFixed(2)}
              </Numeric>
            </span>
          </div>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Made for you</span>
            <h2>Play next</h2>
          </div>
          <Link href="/app/discover">
            See all <ArrowRight aria-hidden size={15} />
          </Link>
        </div>
        <div className={styles.eventGrid}>
          {futureEvents.slice(0, 3).map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
          {futureEvents.length === 0 && (
            <article className={styles.emptyState}>
              <h3>Nothing published nearby yet.</h3>
              <p>Host a pickup and give your community somewhere to play.</p>
              <Link href="/app/pickup/new">Host a pickup</Link>
            </article>
          )}
        </div>
      </section>

      <section className={styles.lowerGrid}>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>Recent results</span>
              <h2>Match history</h2>
            </div>
            <Link href="/app/matches">
              All matches <ArrowRight aria-hidden size={15} />
            </Link>
          </div>
          <div className={styles.matchList}>
            {dashboard.recentMatches.slice(0, 2).map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                viewerId={dashboard.player.id}
              />
            ))}
            {dashboard.recentMatches.length === 0 && (
              <article className={styles.emptyState}>
                <p>No connected matches yet.</p>
              </article>
            )}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.eyebrow}>On your calendar</span>
              <h2>Coming up</h2>
            </div>
            <Link href="/app/play">Full calendar</Link>
          </div>
          <div className={styles.bookingList}>
            {futureBookings.slice(0, 4).map((booking) => (
              <Link href="/app/play" key={booking.id}>
                <span className={styles.bookingDate}>
                  <small>
                    {formatVenueTime(
                      booking.startsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { month: "short" },
                    )}
                  </small>
                  <Numeric tier="block">
                    {formatVenueTime(
                      booking.startsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { day: "numeric" },
                    )}
                  </Numeric>
                </span>
                <span className={styles.bookingCopy}>
                  <strong>{booking.title}</strong>
                  <small>
                    {formatVenueTime(
                      booking.startsAt,
                      "America/Los_Angeles",
                      "en-US",
                      { hour: "numeric", minute: "2-digit" },
                    )}{" "}
                    · {booking.venueName}
                  </small>
                </span>
                <Badge
                  tone={booking.status === "confirmed" ? "positive" : "warning"}
                >
                  {booking.status.replace("-", " ")}
                </Badge>
              </Link>
            ))}
            {futureBookings.length === 0 && (
              <article className={styles.emptyState}>
                <p>Your calendar is open.</p>
                <Link href="/app/discover">Find something to play</Link>
              </article>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
