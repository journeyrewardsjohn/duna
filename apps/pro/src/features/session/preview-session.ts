/**
 * The preview build's sessions (credential-free demo mode only): the
 * preview day's calendar entries with the roster details a courtside screen
 * needs (registration ids, juniors, payment states). Names are the boards'
 * example club; nothing here is a real person. Live builds never read it.
 */
import type { DayEntryInput } from "../today/day-model";
import type { CalendarSessionInput } from "./session-model";

/** Example juniors (their guardian gets the updates). */
const JUNIORS = new Set(["Jamie Stone", "Riley Moss"]);

export function previewCalendarSession(
  entry: DayEntryInput,
): CalendarSessionInput {
  return {
    id: entry.id,
    sourceType: entry.sourceType,
    title: entry.title,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    status: entry.status,
    ...(entry.kind ? { kind: entry.kind } : {}),
    ...(entry.venueId ? { venueId: entry.venueId } : {}),
    ...(entry.venueName ? { venueName: entry.venueName } : {}),
    ...(entry.courtId ? { courtId: entry.courtId } : {}),
    ...(entry.courtName ? { courtName: entry.courtName } : {}),
    ...(entry.coachName ? { coachName: entry.coachName } : {}),
    participantCount: entry.participantCount,
    capacity: entry.capacity,
    attendees: entry.attendees.map((attendee, index) => ({
      registrationId: `${entry.id}-registration-${index + 1}`,
      displayName: attendee.displayName,
      isMinor: JUNIORS.has(attendee.displayName),
      status:
        index === 2 ? "payment-pending" : index % 2 ? "paid" : "confirmed",
      ...(attendee.attendanceStatus
        ? { attendanceStatus: attendee.attendanceStatus }
        : {}),
    })),
    equipment:
      entry.kind === "clinic"
        ? [
            {
              reservationId: `${entry.id}-equipment-1`,
              label: "Ball cart",
              quantity: 1,
            },
          ]
        : [],
  };
}
