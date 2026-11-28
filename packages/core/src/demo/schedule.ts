/**
 * Demo fixtures: schedule (owner: SCHED-API). What `operator.schedule.*`
 * answers in demo mode (no Duna Database). HQ's Schedule demo keeps its
 * own changes in a cookie (apps/hq/components/schedule/schedule-demo.ts)
 * and never needs these to be stored; the procedures answer the would-be
 * result for the ids they are given, so a screen switched to them in demo
 * mode shows the same thing it would after a real call. Prices are
 * illustrative ($40 an hour court rate, the demo club's currency); no real
 * people, no real money.
 */
import { demoOrganization, demoPlayer, demoVenues } from "../demo";
import { teamAvailabilityDemoStaff } from "./team-availability";
import { demoId } from "./ids";

export const SCHEDULE_DEMO_NOW = "2026-12-08T17:00:00.000Z";
export const scheduleDemoCurrency = "USD" as const;
/** The court's illustrative rate: $40 an hour. */
export const scheduleDemoRatePerHourMinor = 4_000;
export const scheduleDemoVenue = demoVenues[0]!;
export const scheduleDemoZone = demoOrganization.timezone;

export const scheduleDemoIds = {
  court: demoId("schedule", 1),
  booking: demoId("schedule", 2),
  order: demoId("schedule", 3),
  organizerRow: demoId("schedule", 4),
  invitedRow: demoId("schedule", 5),
  block: demoId("schedule", 6),
  weeklyBlock: demoId("schedule", 7),
  cancelledSession: demoId("schedule", 8),
  deskPaymentAudit: demoId("schedule", 9),
  refund: demoId("schedule", 10),
} as const;

/** The court-rate price of a slot, as the demo court is priced. */
export function scheduleDemoRateMinor(startsAt: string, endsAt: string): number {
  const minutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000;
  return Math.max(0, Math.round((scheduleDemoRatePerHourMinor * minutes) / 60));
}

export const scheduleDemoBooking = {
  id: scheduleDemoIds.booking,
  courtId: scheduleDemoIds.court,
  courtName: "Court 2",
  venueName: scheduleDemoVenue.name,
  startsAt: "2026-12-09T01:00:00.000Z",
  endsAt: "2026-12-09T02:30:00.000Z",
  orderId: scheduleDemoIds.order,
  totalMinor: 6_000,
  booker: { personId: demoPlayer.id, name: demoPlayer.displayName },
  invited: {
    personId: teamAvailabilityDemoStaff.noa.personId,
    name: teamAvailabilityDemoStaff.noa.displayName,
  },
} as const;

export const scheduleDemoRecipients = [
  {
    personId: scheduleDemoBooking.booker.personId,
    name: scheduleDemoBooking.booker.name,
    role: "booker" as const,
  },
  {
    personId: scheduleDemoBooking.invited.personId,
    name: scheduleDemoBooking.invited.name,
    role: "player" as const,
  },
];

export const scheduleDemoBlock = {
  id: scheduleDemoIds.block,
  resourceType: "court" as const,
  resourceId: scheduleDemoIds.court,
  reason: "Sand grooming",
  startsAt: "2026-12-08T15:00:00.000Z",
  endsAt: "2026-12-08T16:00:00.000Z",
};

/** A weather closure that one clinic was cancelled under. */
export const scheduleDemoCancelledUnder = [
  {
    id: scheduleDemoIds.cancelledSession,
    kind: "session" as const,
    title: "Junior clinic",
    startsAt: "2026-12-08T23:00:00.000Z",
  },
];
