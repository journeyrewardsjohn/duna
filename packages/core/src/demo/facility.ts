/**
 * Demo fixtures: facility (owner: B9). Four listings (one per listing
 * status) on the demo club's venues, access rules in every access mode,
 * access requests in every status and stop-play in every status. Shaped by
 * `contracts/facility.ts`; parsed in contracts/facility.test.ts. Names and
 * prices are placeholders for the fictional demo club.
 */
import { demoOrganization, demoPeople, demoPlayer, demoVenues } from "../demo";
import { demoId } from "./ids";

const [pier, hermosa, house] = demoVenues;
const person = (p: { id: string; displayName: string }) => ({
  personId: p.id,
  displayName: p.displayName,
});

export const facilityDemoIds = {
  liveListing: demoId("facility", 1),
  draftListing: demoId("facility", 2),
  pausedListing: demoId("facility", 3),
  archivedListing: demoId("facility", 4),
  harborVenue: demoId("facility", 5),
  activeStop: demoId("facility", 60),
} as const;

const courtId = (n: number) => demoId("facility", 100 + n);
const courts = (count: number, litUpTo: number) =>
  Array.from({ length: count }, (_, index) => ({
    courtId: courtId(index + 1),
    name: `Court ${index + 1}`,
    lit: index < litUpTo,
    ...(index < litUpTo ? { litUntil: "22:00" } : {}),
  }));

const usd = (amountMinor: number) => ({
  amountMinor,
  currency: "USD" as const,
});

const basePolicies = {
  freeCancelMinutes: 1440,
  noShowPolicy: "[club no-show policy]",
  maxHoursPerPersonPerWeek: 6,
  bookingWindowDays: 7,
  maxPlayersPerCourt: 6,
  lightsOffAt: "22:00",
  noiseEndsAt: "21:30",
  lightningRadiusKm: 13,
  lightningAction: "pause-and-notify" as const,
};

export const facilityDemoListings = [
  {
    id: facilityDemoIds.liveListing,
    organizationId: demoOrganization.id,
    venueId: pier!.id,
    venueName: pier!.name,
    slug: "manhattan-beach-pier-courts",
    status: "live" as const,
    defaultAccess: "anyone" as const,
    lighting: "some-lit" as const,
    payoutMode: "connected" as const,
    pricePerCourtHour: usd(4000),
    waiver: {
      waiverDocumentId: demoId("facility", 90),
      title: "[court waiver]",
    },
    policies: { ...basePolicies, maxHoursPerPersonPerDay: 2 },
    autoApproveSignedAdults: true,
    courts: courts(8, 6),
    publishedAt: "2026-11-20T17:00:00.000Z",
    updatedAt: "2026-11-27T17:00:00.000Z",
  },
  {
    id: facilityDemoIds.draftListing,
    organizationId: demoOrganization.id,
    venueId: hermosa!.id,
    venueName: hermosa!.name,
    slug: "hermosa-pier-courts",
    status: "draft" as const,
    defaultAccess: "approved-only" as const,
    lighting: "all-lit" as const,
    payoutMode: "free-only" as const,
    pricePerCourtHour: usd(0),
    policies: {
      ...basePolicies,
      lightningAction: "cancel-and-refund" as const,
    },
    autoApproveSignedAdults: false,
    courts: courts(4, 4),
    updatedAt: "2026-11-27T17:00:00.000Z",
  },
  {
    id: facilityDemoIds.pausedListing,
    organizationId: demoOrganization.id,
    venueId: house!.id,
    venueName: house!.name,
    slug: "duna-house-courts",
    status: "paused" as const,
    defaultAccess: "members-only" as const,
    lighting: "no-lights" as const,
    payoutMode: "connected" as const,
    pricePerCourtHour: usd(3000),
    policies: { ...basePolicies, lightningAction: "notify-only" as const },
    autoApproveSignedAdults: false,
    courts: courts(2, 0),
    updatedAt: "2026-11-27T17:00:00.000Z",
  },
  {
    id: facilityDemoIds.archivedListing,
    organizationId: demoOrganization.id,
    venueId: facilityDemoIds.harborVenue,
    venueName: "Harbor Sand Courts",
    slug: "harbor-sand-courts",
    status: "archived" as const,
    defaultAccess: "first-come" as const,
    lighting: "no-lights" as const,
    payoutMode: "free-only" as const,
    pricePerCourtHour: usd(0),
    policies: { bookingWindowDays: 0 },
    autoApproveSignedAdults: false,
    courts: courts(2, 0),
    updatedAt: "2026-11-01T17:00:00.000Z",
  },
];

const rule = (
  n: number,
  access:
    | "anyone"
    | "approved-only"
    | "members-only"
    | "first-come"
    | "open-play"
    | "residents-first",
  summary: string,
  extra: Record<string, unknown> = {},
) => ({
  id: demoId("facility", 20 + n),
  listingId: facilityDemoIds.liveListing,
  access,
  courtIds: [] as string[],
  weekdays: [1, 2, 3, 4, 5],
  priority: n,
  status: "active" as "draft" | "active" | "archived",
  summary,
  ...extra,
});

export const facilityDemoAccessRules = [
  rule(1, "anyone", "Weekdays until 4 PM: anyone on Duna", {
    startsAt: "07:00",
    endsAt: "16:00",
  }),
  rule(2, "approved-only", "Weekdays after 4 PM: approved players only", {
    startsAt: "16:00",
    endsAt: "22:00",
  }),
  rule(3, "members-only", "Courts 7–8 on weekends: members only", {
    courtIds: [courtId(7), courtId(8)],
    weekdays: [0, 6],
  }),
  rule(4, "first-come", "Sunday mornings: first come, first served", {
    weekdays: [0],
    startsAt: "07:00",
    endsAt: "10:00",
    status: "archived",
  }),
  rule(5, "open-play", "Saturday evenings: open play, no reservation", {
    weekdays: [6],
    startsAt: "17:00",
    endsAt: "20:00",
  }),
  rule(6, "residents-first", "Jun 1–Aug 31: residents first, 48 hours early", {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    seasonStartsOn: "2027-06-01",
    seasonEndsOn: "2027-08-31",
    earlyAccessHours: 48,
    status: "draft",
  }),
];

const request = (
  n: number,
  who: { id: string; displayName: string },
  status: "requested" | "approved" | "declined" | "expired" | "removed",
  extra: Record<string, unknown> = {},
) => ({
  id: demoId("facility", 40 + n),
  listingId: facilityDemoIds.liveListing,
  person: person(who),
  status,
  playCount: n * 2,
  autoApproved: false,
  requestedAt: "2026-11-25T18:00:00.000Z",
  ...(status === "requested" ? {} : { decidedAt: "2026-11-26T18:00:00.000Z" }),
  ...extra,
});

export const facilityDemoAccessRequests = [
  request(1, demoPeople[0]!, "requested", {
    affiliation: "[team name]",
    rating: 3.42,
    waiverSignedAt: "2026-11-25T17:55:00.000Z",
  }),
  request(2, demoPeople[1]!, "approved", {
    expiresAt: "2026-12-31T23:59:00.000Z",
    waiverSignedAt: "2026-11-01T17:00:00.000Z",
  }),
  request(3, demoPlayer, "approved", {
    autoApproved: true,
    waiverSignedAt: "2026-11-02T17:00:00.000Z",
  }),
  request(4, demoPeople[2]!, "declined", {
    decisionNote: "[reason shared with the player]",
  }),
  request(5, demoPeople[3]!, "expired", {
    expiresAt: "2026-11-15T23:59:00.000Z",
  }),
  request(6, demoPeople[0]!, "removed", {
    guardian: person(demoPlayer),
  }),
];

export const facilityDemoPlayStops = [
  {
    id: facilityDemoIds.activeStop,
    venueId: pier!.id,
    courtIds: [] as string[],
    reason: "lightning" as const,
    source: "weather-alert" as const,
    status: "active" as const,
    note: "Lightning 8 mi away",
    startsAt: "2026-11-27T22:10:00.000Z",
    affectedReservations: 5,
  },
  {
    id: demoId("facility", 61),
    venueId: pier!.id,
    courtIds: [courtId(3)],
    reason: "maintenance" as const,
    source: "manual" as const,
    status: "lifted" as const,
    note: "Net repair",
    startsAt: "2026-11-26T15:00:00.000Z",
    endsAt: "2026-11-26T18:00:00.000Z",
    liftedAt: "2026-11-26T17:30:00.000Z",
    startedBy: person(demoPlayer),
    affectedReservations: 1,
  },
  {
    id: demoId("facility", 62),
    venueId: hermosa!.id,
    courtIds: [] as string[],
    reason: "weather" as const,
    source: "manual" as const,
    status: "expired" as const,
    startsAt: "2026-11-24T20:00:00.000Z",
    endsAt: "2026-11-24T23:00:00.000Z",
    startedBy: person(demoPlayer),
    affectedReservations: 0,
  },
  {
    id: demoId("facility", 63),
    venueId: house!.id,
    courtIds: [courtId(1), courtId(2)],
    reason: "event" as const,
    source: "manual" as const,
    status: "expired" as const,
    startsAt: "2026-11-22T16:00:00.000Z",
    endsAt: "2026-11-22T22:00:00.000Z",
    affectedReservations: 0,
  },
  {
    id: demoId("facility", 64),
    venueId: house!.id,
    courtIds: [] as string[],
    reason: "other" as const,
    source: "manual" as const,
    status: "lifted" as const,
    startsAt: "2026-11-20T16:00:00.000Z",
    liftedAt: "2026-11-20T16:30:00.000Z",
    affectedReservations: 0,
  },
];

const live = facilityDemoListings[0]!;

export const facilityDemoPublicListing = {
  slug: live.slug,
  name: live.venueName,
  locality: pier!.city,
  timezone: pier!.timezone,
  lighting: live.lighting,
  accessBanner: "Open to everyone until 4 PM, then approved players only",
  pricePerCourtHour: live.pricePerCourtHour,
  waiverRequired: true,
  policies: live.policies,
  courts: live.courts,
  activePlayStop: {
    reason: "lightning" as const,
    startsAt: "2026-11-27T22:10:00.000Z",
    note: "Lightning 8 mi away",
  },
};

const slot = (
  court: number,
  hourUtc: number,
  state: "available" | "taken" | "ask" | "stopped" | "closed",
  access: "anyone" | "approved-only",
) => ({
  courtId: courtId(court),
  startsAt: `2026-11-28T${String(hourUtc).padStart(2, "0")}:00:00.000Z`,
  endsAt: `2026-11-28T${String(hourUtc + 1).padStart(2, "0")}:00:00.000Z`,
  state,
  ...(state === "available" || state === "ask" ? { price: usd(4000) } : {}),
  access,
});

export const facilityDemoSlots = {
  slug: live.slug,
  date: "2026-11-28",
  slots: [
    slot(1, 16, "available", "anyone"),
    slot(1, 17, "taken", "anyone"),
    slot(2, 16, "available", "anyone"),
    slot(1, 22, "stopped", "approved-only"),
    slot(2, 21, "ask", "approved-only"),
    slot(7, 15, "closed", "anyone"),
  ],
};

export const facilityDemo = {
  domain: "facility",
  listings: facilityDemoListings,
  accessRules: facilityDemoAccessRules,
  accessRequests: facilityDemoAccessRequests,
  playStops: facilityDemoPlayStops,
  publicListing: facilityDemoPublicListing,
  slots: facilityDemoSlots,
} as const;
