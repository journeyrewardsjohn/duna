import "@/components/player/player.css";

import type { Metadata } from "next";
import { getAppSession, loadDashboard } from "@/components/app-shell/session";
import { loadMatches } from "@/components/player/matches/matches-data";
import { PickupForm } from "@/components/player/pickup/pickup-form";
import { recentPeople } from "@/components/player/score/score-model";
import { NotForThisAccount } from "@/components/player/states";

export const metadata: Metadata = { title: "Host a pickup" };

function local(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

/**
 * Host a pickup (`/app/pickup/new`, P-WEB-1): the form, a review of what
 * players will see, then publish. `?courtBookingId=` starts from a court the
 * person booked (its place and time filled in). Adults only.
 */
export default async function NewPickupPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly courtBookingId?: string }>;
}) {
  const [{ courtBookingId }, session] = await Promise.all([
    searchParams,
    getAppSession(),
  ]);
  const head = (
    <header className="pp-head">
      <div className="pp-head__text">
        <h1 className="td-display pp-title">Host a pickup</h1>
        <p className="td-lead">
          Set the place, time and level. You see exactly what players will see
          before it goes live.
        </p>
      </div>
    </header>
  );
  if (session.junior || session.actingFor) {
    return (
      <div className="pp">
        {head}
        <NotForThisAccount
          area="Hosting a pickup"
          grantedBy={
            session.actingFor
              ? "your own account: switch back to it first"
              : "an adult account"
          }
        />
      </div>
    );
  }
  const [dashboard, history] = await Promise.all([
    loadDashboard(),
    loadMatches(),
  ]);
  const court = dashboard.bookings.find(
    (booking) =>
      booking.id === courtBookingId &&
      booking.source === "court" &&
      booking.status === "confirmed",
  );
  const zone = court?.venueTimezone ?? "America/Los_Angeles";
  const start = court
    ? local(court.startsAt, zone)
    : local(new Date(Date.now() + 86_400_000).toISOString(), zone);
  const partners = history.ok
    ? recentPeople(history.value.matches, dashboard.player.id).partners
    : [];
  return (
    <div className="pp pp--narrow">
      {head}
      <PickupForm
        {...(court ? { courtBookingId: court.id } : {})}
        hostId={dashboard.player.id}
        initial={{
          title: "Golden Hour 4s",
          day: start.day,
          time: court ? start.time : "17:30",
          durationMinutes: court
            ? Math.round(
                (Date.parse(court.endsAt) - Date.parse(court.startsAt)) /
                  60_000,
              )
            : 90,
          ...(court
            ? {
                place: {
                  label: court.venueName,
                  ...(court.venueId ? { venueId: court.venueId } : {}),
                  confidence: "confirmed" as const,
                },
              }
            : {}),
          capacity: 8,
          note: "",
          visibility: "public",
          approvalRequired: false,
          waitlistEnabled: true,
        }}
        mode="new"
        suggestions={partners}
      />
    </div>
  );
}
