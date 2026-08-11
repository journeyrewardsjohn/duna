import { PickupForm } from "@/components/pickup-form";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Host pickup" };

function venueLocalDateTime(instant: string, timeZone: string): string {
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
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default async function NewPickupPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ courtBookingId?: string }>;
}) {
  const query = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, players] = await Promise.all([
    caller.player.dashboard(),
    caller.public.players({ limit: 50 }),
  ]);
  const initialCourtBooking = dashboard.bookings.find(
    (booking) =>
      booking.id === query.courtBookingId &&
      booking.source === "court" &&
      booking.status === "confirmed",
  );
  return (
    <main className="standard-page">
      <PickupForm
        hostPersonId={dashboard.player.id}
        initialCourtBooking={
          initialCourtBooking
            ? {
                id: initialCourtBooking.id,
                venueId: initialCourtBooking.venueId,
                venueName: initialCourtBooking.venueName,
                startsAt: initialCourtBooking.startsAt,
                endsAt: initialCourtBooking.endsAt,
                localStartsAt: venueLocalDateTime(
                  initialCourtBooking.startsAt,
                  initialCourtBooking.venueTimezone ?? "UTC",
                ),
              }
            : undefined
        }
        initialPlayers={players.filter(
          (player) => player.id !== dashboard.player.id,
        )}
      />
    </main>
  );
}
