import "@/components/discover/discover.css";

import type { PersonSummary } from "@duna/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadVenuePage } from "@/components/discover/venue-data";
import {
  localVenueStart,
  requestedVenueStart,
} from "@/components/discover/venue-time";
import { VenueView } from "@/components/discover/venue-view";
import { mapPresence } from "@/components/discover/map-presence.server";
import { getServerCaller } from "@/lib/api";

type Props = {
  readonly params: Promise<{ venueId: string }>;
  readonly searchParams: Promise<{
    checkout?: string;
    session_id?: string;
    date?: string;
    duration?: string;
    start?: string;
    intent?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { venueId } = await params;
  const venue = await loadVenuePage(venueId, "/app/venues");
  return { title: venue ? venue.name : "Venue" };
}

/**
 * A venue inside the Player shell (`/app/venues/[venueId]`): the same page
 * as `/venues/[venueId]`, with booking for the person and their household.
 * Sign-in returns here with `date`, `start`, `duration` and `intent`; the
 * payment page returns with `checkout` and `session_id`.
 */
export default async function AppVenuePage({ params, searchParams }: Props) {
  const { venueId } = await params;
  const query = await searchParams;
  const venue = await loadVenuePage(venueId, "/app/venues");
  if (!venue) notFound();
  const map = await mapPresence();
  const caller = await getServerCaller();
  const [settings, suggestedPlayers] = await Promise.all([
    // Signed out, the shell sends the person to sign in (and back here);
    // until then the page renders as it would for a visitor.
    caller.player.settings().catch(() => undefined),
    caller.public.players({ limit: 12 }).catch(() => [] as PersonSummary[]),
  ]);
  if (!settings) {
    return (
      <VenueView
        booking={{
          mode: "guest",
          defaultLocalStartsAt:
            requestedVenueStart(query) ?? localVenueStart(venue.timezone),
        }}
        discoverPath="/app/discover"
        map={map}
        venue={venue}
      />
    );
  }
  const duration = Number(query.duration);
  const membership = settings.membership;
  return (
    <VenueView
      booking={{
        mode: "player",
        defaultLocalStartsAt:
          requestedVenueStart(query) ?? localVenueStart(venue.timezone),
        ...(Number.isInteger(duration) && duration > 0
          ? { defaultDurationMinutes: duration }
          : {}),
        bookingSubjects: [
          settings.profile.person,
          ...settings.household
            .filter((member) => member.role === "dependent" && member.verified)
            .map((member) => member.person),
        ],
        suggestedPlayers,
        isDunaPlus: Boolean(
          membership &&
          ["active", "trialing"].includes(membership.status) &&
          !membership.pausedUntil,
        ),
        ...(query.checkout === "success" && query.session_id
          ? { initialCheckoutSessionId: query.session_id }
          : {}),
        ...(query.checkout === "cancelled"
          ? {
              initialNotice:
                "Payment was cancelled. The court hold is released automatically.",
            }
          : {}),
        ...(query.intent === "host"
          ? { initialCheckoutIntent: "host" as const }
          : {}),
      }}
      discoverPath="/app/discover"
      map={map}
      venue={venue}
    />
  );
}
