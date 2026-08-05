import {
  MEMBERSHIP_PLANS,
  membershipTierCode,
  type MembershipBillingInterval,
  type PaidMembershipPlanId,
} from "@duna/core";
import { getDatabase } from "./client";
import {
  courts,
  membershipTiers,
  organizations,
  people,
  programs,
  ratings,
  sessions,
  venues,
  walletAccounts,
  walletLedger,
} from "./schema";

const database = getDatabase();

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  venue: "10000000-0000-4000-8000-000000000002",
  court1: "10000000-0000-4000-8000-000000000003",
  court2: "10000000-0000-4000-8000-000000000004",
  mara: "10000000-0000-4000-8000-000000000010",
  theo: "10000000-0000-4000-8000-000000000011",
  noa: "10000000-0000-4000-8000-000000000012",
  sam: "10000000-0000-4000-8000-000000000013",
  program: "10000000-0000-4000-8000-000000000020",
  session: "10000000-0000-4000-8000-000000000021",
  premiumMonthlyTier: "10000000-0000-4000-8000-000000000030",
  premiumAnnualTier: "10000000-0000-4000-8000-000000000031",
  premiumPlusMonthlyTier: "10000000-0000-4000-8000-000000000032",
  premiumPlusAnnualTier: "10000000-0000-4000-8000-000000000033",
  wallet: "10000000-0000-4000-8000-000000000040",
  prize: "10000000-0000-4000-8000-000000000041",
} as const;

await database
  .insert(organizations)
  .values({
    id: ids.organization,
    slug: "south-bay-volleyball",
    name: "South Bay Volleyball Club",
    legalName: "Beach Elite LLC",
    plan: "club",
    timezone: "America/Los_Angeles",
    currency: "USD",
    stripeChargesEnabled: false,
    marketLaunchEnabled: true,
  })
  .onConflictDoNothing();

await database
  .insert(people)
  .values([
    {
      id: ids.mara,
      displayName: "Mara Lewis",
      givenName: "Mara",
      familyName: "Lewis",
      handle: "maralewis",
      phoneE164: "+13105550101",
      homeMarket: "South Bay, Los Angeles",
      profileVisibility: "public",
    },
    {
      id: ids.theo,
      displayName: "Theo Park",
      givenName: "Theo",
      familyName: "Park",
      handle: "theopark",
      phoneE164: "+13105550102",
      homeMarket: "South Bay, Los Angeles",
      profileVisibility: "public",
    },
    {
      id: ids.noa,
      displayName: "Noa Williams",
      givenName: "Noa",
      familyName: "Williams",
      handle: "noawilliams",
      phoneE164: "+13105550103",
      homeMarket: "San Diego",
      profileVisibility: "public",
    },
    {
      id: ids.sam,
      displayName: "Sam Rivera",
      givenName: "Sam",
      familyName: "Rivera",
      handle: "samrivera",
      phoneE164: "+13105550104",
      homeMarket: "South Bay, Los Angeles",
      profileVisibility: "public",
    },
  ])
  .onConflictDoNothing();

await database
  .insert(venues)
  .values({
    id: ids.venue,
    organizationId: ids.organization,
    slug: "manhattan-beach",
    name: "Manhattan Beach Pier",
    status: "active",
    locality: "Manhattan Beach",
    administrativeArea: "CA",
    postalCode: "90266",
    timezone: "America/Los_Angeles",
    latitude: 33.8847,
    longitude: -118.4109,
  })
  .onConflictDoNothing();

await database
  .insert(courts)
  .values([
    {
      id: ids.court1,
      venueId: ids.venue,
      name: "Court 1",
      surface: "sand",
      lit: false,
      status: "active",
      qrToken: "duna-demo-manhattan-court-1",
    },
    {
      id: ids.court2,
      venueId: ids.venue,
      name: "Court 2",
      surface: "sand",
      lit: false,
      status: "active",
      qrToken: "duna-demo-manhattan-court-2",
    },
  ])
  .onConflictDoNothing();

await database
  .insert(programs)
  .values({
    id: ids.program,
    organizationId: ids.organization,
    slug: "south-bay-summer-series",
    title: "South Bay Summer Series",
    description: "Eight weeks of sunset doubles under the pier.",
    kind: "league",
    status: "registration-open",
  })
  .onConflictDoNothing();

await database
  .insert(sessions)
  .values({
    id: ids.session,
    programId: ids.program,
    venueId: ids.venue,
    title: "South Bay Summer Series — Week 5",
    slug: "south-bay-summer-series-week-5",
    startsAt: new Date("2026-08-04T01:00:00.000Z"),
    endsAt: new Date("2026-08-04T04:00:00.000Z"),
    timezone: "America/Los_Angeles",
    status: "registration-open",
    capacity: 48,
    minimumCapacity: 8,
    publishedAt: new Date("2026-07-01T16:00:00.000Z"),
  })
  .onConflictDoNothing();

await database
  .insert(ratings)
  .values([
    {
      personId: ids.mara,
      discipline: "beach-2s",
      mu: 2148,
      phi: 52,
      sigma: 0.057,
      display: 4.62,
      confidence: "Locked",
      current52WeekPeak: 4.68,
      ratedMatches: 84,
    },
    {
      personId: ids.theo,
      discipline: "beach-2s",
      mu: 2076,
      phi: 68,
      sigma: 0.061,
      display: 4.44,
      confidence: "Reliable",
      current52WeekPeak: 4.51,
      ratedMatches: 46,
    },
    {
      personId: ids.noa,
      discipline: "beach-2s",
      mu: 2212,
      phi: 61,
      sigma: 0.058,
      display: 4.78,
      confidence: "Reliable",
      current52WeekPeak: 4.82,
      ratedMatches: 53,
    },
  ])
  .onConflictDoNothing();

const platformMembershipTiers: readonly {
  id: string;
  plan: PaidMembershipPlanId;
  interval: MembershipBillingInterval;
}[] = [
  { id: ids.premiumMonthlyTier, plan: "premium", interval: "month" },
  { id: ids.premiumAnnualTier, plan: "premium", interval: "year" },
  {
    id: ids.premiumPlusMonthlyTier,
    plan: "premium-plus",
    interval: "month",
  },
  {
    id: ids.premiumPlusAnnualTier,
    plan: "premium-plus",
    interval: "year",
  },
];

await database
  .insert(membershipTiers)
  .values(
    platformMembershipTiers.map(({ id, plan, interval }) => {
      const definition = MEMBERSHIP_PLANS[plan];
      return {
        id,
        code: membershipTierCode(plan, interval),
        name: `${definition.name} ${interval === "month" ? "Monthly" : "Annual"}`,
        priceMinor:
          interval === "month"
            ? definition.monthlyPriceMinor
            : definition.annualPriceMinor,
        currency: "USD",
        interval,
        benefits: definition.benefits,
      };
    }),
  )
  .onConflictDoNothing();

await database
  .insert(walletAccounts)
  .values({
    id: ids.wallet,
    personId: ids.mara,
    currency: "USD",
    kycStatus: "verified",
  })
  .onConflictDoNothing();

await database
  .insert(walletLedger)
  .values({
    id: ids.prize,
    walletAccountId: ids.wallet,
    direction: "credit",
    kind: "prize",
    amountMinor: 18_400,
    currency: "USD",
    status: "available",
    taxCharacter: "prize",
    reasonCode: "summer-open-first-place",
  })
  .onConflictDoNothing();

console.log("Duna demo seed is ready.");
