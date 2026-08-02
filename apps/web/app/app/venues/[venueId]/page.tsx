import { notFound } from "next/navigation";
import { CourtBookingPanel } from "@/components/court-booking-panel";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Book a court" };

function defaultVenueStart(timeZone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T10:00`;
}

export default async function VenueBookingPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ venueId: string }>;
  readonly searchParams: Promise<{
    checkout?: string;
    session_id?: string;
  }>;
}) {
  const { venueId } = await params;
  const query = await searchParams;
  const caller = await getServerCaller();
  const [inventory, settings, suggestedPlayers] = await Promise.all([
    caller.public.courtBookingInventory({ venueId }).catch(() => undefined),
    caller.player.settings(),
    caller.public.players({ limit: 12 }),
  ]);
  if (!inventory) notFound();
  return (
    <main className="standard-page court-booking-page">
      <CourtBookingPanel
        defaultLocalStartsAt={defaultVenueStart(inventory.venue.timezone)}
        initialCheckoutSessionId={
          query.checkout === "success" ? query.session_id : undefined
        }
        initialNotice={
          query.checkout === "cancelled"
            ? "Stripe Checkout was cancelled. The temporary court hold will release automatically."
            : undefined
        }
        bookingSubjects={[
          settings.profile.person,
          ...settings.household
            .filter((member) => member.role === "dependent" && member.verified)
            .map((member) => member.person),
        ]}
        inventory={inventory}
        suggestedPlayers={suggestedPlayers}
        isDunaPlus={Boolean(
          settings.membership &&
          ["active", "trialing"].includes(settings.membership.status) &&
          !settings.membership.pausedUntil,
        )}
      />
    </main>
  );
}
