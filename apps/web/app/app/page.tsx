import { formatVenueTime } from "@duna/core";
import { Numeric } from "@duna/ui";
import { ArrowRight, Plus, Radio } from "lucide-react";
import Link from "next/link";
import { MatchCard } from "@/components/match-card";
import { PredictionDiscoverySection } from "@/components/prediction-discovery";
import { SandPlayerHome } from "@/components/sand-player-home";
import { getServerCaller } from "@/lib/api";

export default async function PlayerDashboard() {
  const caller = await getServerCaller();
  const [dashboard, settings, predictionDiscovery, liveVideos, access] =
    await Promise.all([
      caller.player.dashboard(),
      caller.player.settings(),
      caller.public.predictionDiscovery({ limit: 6 }),
      caller.public.videos({ liveOnly: true }).catch(() => []),
      caller.player.organizationAccess(),
    ]);
  const { player } = dashboard;
  const now = Date.now();
  const events = dashboard.events
    .filter(
      (event) =>
        event.lifecycleStatus !== "cancelled" && Date.parse(event.endsAt) > now,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const bookings = dashboard.bookings
    .filter((booking) => Date.parse(booking.endsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const nextBooking = bookings[0];
  const nextHosted = events.find((event) => event.host?.id === player.id);
  const hostedIsNext =
    nextHosted &&
    (!nextBooking ||
      Date.parse(nextHosted.startsAt) < Date.parse(nextBooking.startsAt));
  const next = hostedIsNext
    ? {
        title: nextHosted.title,
        detail: `${formatVenueTime(nextHosted.startsAt, nextHosted.timezone)} · ${nextHosted.venueName}`,
        href: `/events/${nextHosted.slug}`,
        needsAction: false,
      }
    : nextBooking
      ? {
          title: nextBooking.title,
          detail: `${formatVenueTime(nextBooking.startsAt, nextBooking.venueTimezone ?? "UTC")} · ${nextBooking.venueName}`,
          href: "/app/play",
          needsAction: nextBooking.status === "needs-action",
        }
      : undefined;

  return (
    <SandPlayerHome
      clubs={access.organizations}
      events={events}
      firstName={player.displayName.split(" ")[0] ?? player.displayName}
      playerId={player.id}
      next={next}
    >
      {settings.profile.onboardingStatus !== "complete" ? (
        <Link className="sand-profile-prompt" href="/app/onboarding">
          <span>
            <strong>Make Duna yours.</strong> Complete your player profile.
          </span>
          <ArrowRight aria-hidden size={20} />
        </Link>
      ) : null}
      {liveVideos.length > 0 ? (
        <section className="sand-live">
          <header>
            <h2>
              <Radio aria-hidden size={20} /> Live now
            </h2>
          </header>
          <div>
            {liveVideos.slice(0, 6).map((video) => (
              <Link href={`/watch/${video.id}`} key={video.id}>
                <span className="sand-club-mark">{video.owner.initials}</span>
                <strong>{video.owner.displayName}</strong>
                <span>Watch live →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <section className="sand-performance">
        <header>
          <h2>Your game</h2>
          <Link href="/app/score">
            <Plus aria-hidden size={17} /> Record a match
          </Link>
        </header>
        <div className="sand-performance__stats">
          <Link href="/app/matches">
            <span>Sand Rating</span>
            <Numeric>{player.rating.display.toFixed(2)}</Numeric>
            <small>{player.rating.confidence}</small>
          </Link>
          <Link href="/app/matches">
            <span>Recent matches</span>
            <Numeric>{dashboard.recentMatches.length}</Numeric>
            <small>View your results</small>
          </Link>
          <Link href="/app/wallet">
            <span>Your wallet</span>
            <Numeric>
              ${(dashboard.walletBalanceMinor / 100).toFixed(2)}
            </Numeric>
            <small>Balance and passes</small>
          </Link>
        </div>
      </section>
      <PredictionDiscoverySection discovery={predictionDiscovery} />
      <section className="sand-history">
        <header>
          <h2>Recent matches</h2>
          <Link href="/app/matches">
            All matches <ArrowRight aria-hidden size={17} />
          </Link>
        </header>
        <div>
          {dashboard.recentMatches.slice(0, 2).map((match) => (
            <MatchCard key={match.id} match={match} viewerId={player.id} />
          ))}
          {!dashboard.recentMatches.length ? (
            <p>Your completed matches will appear here.</p>
          ) : null}
        </div>
      </section>
      <section className="sand-upcoming">
        <header>
          <h2>On your calendar</h2>
          <Link href="/app/play">
            Full calendar <ArrowRight aria-hidden size={17} />
          </Link>
        </header>
        {bookings.slice(0, 4).map((booking) => (
          <Link href="/app/play" key={booking.id}>
            <time dateTime={booking.startsAt}>
              {formatVenueTime(
                booking.startsAt,
                booking.venueTimezone ?? "UTC",
              )}
            </time>
            <span>
              <strong>{booking.title}</strong>
              <small>{booking.venueName}</small>
            </span>
            <span>{booking.status.replaceAll("-", " ")}</span>
            <ArrowRight aria-hidden size={18} />
          </Link>
        ))}
        {!bookings.length ? (
          <p>Your calendar is open. Find something to play.</p>
        ) : null}
      </section>
    </SandPlayerHome>
  );
}
