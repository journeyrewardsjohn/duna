/**
 * Preview builds only (the app's preview mode, never a signed-in account):
 * the same fictional clubs the web wallet's demo mode shows, so the native
 * wallet can be seen and tested with 0, 1, 5 or 12 cards
 * (`duna://dev/shell?tab=connect&route=wallet&id=demo-12`). Every club here
 * is invented; the pass is a sample string labelled as one.
 */
import type { MembershipPassData } from "@duna/tideline-core";
import type { ClubBooking, ClubSummary } from "./wallet-model";

const CLUBS: readonly (Omit<ClubSummary, "organizationId"> & {
  readonly id: string;
})[] = [
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000001",
    organizationName: "Saltline Beach Club",
    organizationSlug: "saltline-demo",
    credits: 8,
    status: "active",
    nextExpiringCredits: 2,
    nextExpirationAt: "2026-12-14T12:00:00Z",
    membershipName: "Annual member",
    membershipStatus: "active",
    membershipInterval: "year",
    membershipPriceMinor: 46000,
    membershipCurrency: "USD",
    membershipCurrentPeriodEndsAt: "2027-11-30T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000002",
    organizationName: "Harbor Lights Volleyball",
    organizationSlug: "harbor-lights-demo",
    credits: 0,
    status: "active",
    nextExpiringCredits: 0,
    membershipName: "Night league member",
    membershipStatus: "active",
    membershipInterval: "month",
    membershipPriceMinor: 3800,
    membershipCurrency: "USD",
    membershipCurrentPeriodEndsAt: "2026-12-02T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000003",
    organizationName: "Kelp Point VC",
    organizationSlug: "kelp-point-demo",
    credits: 0,
    status: "frozen",
    nextExpiringCredits: 0,
    membershipName: "Family plan",
    membershipStatus: "paused",
    membershipInterval: "month",
    membershipPriceMinor: 9500,
    membershipCurrency: "USD",
    membershipCurrentPeriodEndsAt: "2027-01-04T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000004",
    organizationName: "Pier Nine Beach Volley",
    organizationSlug: "pier-nine-demo",
    credits: 0,
    status: "active",
    nextExpiringCredits: 0,
    membershipName: "Social member",
    membershipStatus: "pending",
    membershipInterval: "month",
    membershipPriceMinor: 2500,
    membershipCurrency: "USD",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000005",
    organizationName: "Northshore Sand Collective",
    organizationSlug: "northshore-demo",
    credits: 3,
    status: "active",
    nextExpiringCredits: 3,
    nextExpirationAt: "2027-03-31T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000006",
    organizationName: "Driftwood BVC",
    organizationSlug: "driftwood-demo",
    credits: 0,
    status: "closed",
    nextExpiringCredits: 0,
    membershipName: "Annual member",
    membershipStatus: "canceled",
    membershipInterval: "year",
    membershipPriceMinor: 30000,
    membershipCurrency: "USD",
    membershipCancellationEffectiveAt: "2026-10-31T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000007",
    organizationName: "Sundial Sand Club",
    organizationSlug: "sundial-demo",
    credits: 4,
    status: "active",
    nextExpiringCredits: 4,
    nextExpirationAt: "2026-12-01T12:00:00Z",
    membershipName: "Monthly member",
    membershipStatus: "active",
    membershipInterval: "month",
    membershipPriceMinor: 4200,
    membershipCurrency: "USD",
    membershipCurrentPeriodEndsAt: "2026-12-01T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000008",
    organizationName: "Low Tide Social",
    organizationSlug: "low-tide-demo",
    credits: 0,
    status: "active",
    nextExpiringCredits: 0,
    membershipName: "Social member",
    membershipStatus: "active",
    membershipInterval: "month",
    membershipPriceMinor: 2000,
    membershipCurrency: "USD",
    membershipCurrentPeriodEndsAt: "2026-12-01T12:00:00Z",
    membershipCancelAtPeriodEnd: true,
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-000000000009",
    organizationName: "Dune House",
    organizationSlug: "dune-house-demo",
    credits: 2,
    status: "active",
    nextExpiringCredits: 0,
    membershipName: "Annual member",
    membershipStatus: "active",
    membershipInterval: "year",
    membershipPriceMinor: 52000,
    membershipCurrency: "USD",
    membershipCurrentPeriodEndsAt: "2027-01-12T12:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-00000000000a",
    organizationName: "Cove Street Academy",
    organizationSlug: "cove-street-demo",
    credits: 6,
    status: "active",
    nextExpiringCredits: 0,
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-00000000000b",
    organizationName: "Marram Courts",
    organizationSlug: "marram-demo",
    credits: 1,
    status: "active",
    nextExpiringCredits: 1,
    nextExpirationAt: "2026-11-29T05:00:00Z",
  },
  {
    id: "0b7c3f7e-5d1a-4c55-9d33-00000000000c",
    organizationName: "Lantern Bay Club",
    organizationSlug: "lantern-bay-demo",
    credits: 0,
    status: "active",
    nextExpiringCredits: 0,
    membershipName: "Annual member",
    membershipStatus: "trialing",
    membershipInterval: "year",
    membershipPriceMinor: 21000,
    membershipCurrency: "USD",
    membershipTrialEndsAt: "2026-12-12T12:00:00Z",
    membershipCurrentPeriodEndsAt: "2027-12-12T12:00:00Z",
  },
];

/** The preview's card count from the route's target (`demo-0|1|5|12`). */
export function demoCount(target: string | undefined): number {
  const match = /^demo-(\d{1,2})$/.exec(target ?? "");
  const count = match ? Number(match[1]) : 5;
  return Math.max(0, Math.min(CLUBS.length, count));
}

export function demoWallet(count: number, now: Date) {
  const clubs: ClubSummary[] = CLUBS.slice(0, count).map(({ id, ...club }) => ({
    ...club,
    organizationId: id,
  }));
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const booking = (
    personId: string,
    club: number,
    title: string,
    startsAt: string,
    status: string,
  ): ClubBooking => ({
    bookingId: `demo-${club}-${startsAt}`,
    title,
    status,
    startsAt,
    timezone: "America/Los_Angeles",
    organization: { id: CLUBS[club]!.id },
    participant: { personId },
    venue: { name: "North beach courts" },
  });
  return {
    clubs,
    pass: {
      code: "duna:member:v1:demo-sample",
      rotation: "static",
      label: "Sample pass (preview)",
    } satisfies MembershipPassData,
    upcoming: (personId: string): ClubBooking[] => [
      booking(personId, 0, "Open play · Court 3", at(1, 16), "confirmed"),
      booking(personId, 0, "Clinic: serve receive", at(4, 2), "confirmed"),
      booking(personId, 1, "League night · Week 6", at(6, 3), "confirmed"),
    ],
    past: (personId: string): ClubBooking[] => [
      booking(personId, 0, "Open play · Court 3", at(-4, 16), "attended"),
      booking(personId, 0, "Open play · Court 1", at(-6, 17), "attended"),
      booking(personId, 1, "League night · Week 5", at(-1, 3), "attended"),
    ],
  };
}
