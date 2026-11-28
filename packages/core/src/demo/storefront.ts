/**
 * Demo fixtures: public club storefronts (owner: SITE-5). What
 * `public.organizationStorefront` returns in demo mode, so the public club,
 * offering and coach pages can be walked end to end without a database.
 *
 * Three demo clubs cover the page's states: South Bay (the demo
 * organisation, a published theme, a full catalog with group sessions in
 * several display states, a membership and goods), Pier Avenue (no published
 * theme: Duna's defaults) and Northside (nothing published yet). Every name,
 * price and policy is illustrative demo data; no real people or clubs.
 *
 * Deterministic: ids from `demoId("storefront", n)`, session times derived
 * from the `now` the caller passes in. Typed structurally (this package
 * never imports `@duna/api`); `packages/api` parses each fixture with
 * `publicOrganizationStorefrontSchema` in its test.
 */
import { demoOrganization, demoPeople, demoVenues } from "../demo";
import { demoId } from "./ids";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const theo = demoPeople.find((person) => person.handle === "theopark")!;
const sam = demoPeople.find((person) => person.handle === "samrivera")!;

/** Duna's default palette, as the connected storefront returns it. */
const DEFAULT_PALETTE = {
  primary: "#517986",
  accent: "#BDD2D9",
  sand: "#E5F1F5",
  ink: "#2D4D57",
  canvas: "#F6F5F1",
  success: "#2F6B3A",
  clubHue: 220.25,
  clubChroma: 0.0489,
} as const;

const DEFAULT_THEME = {
  palette: DEFAULT_PALETTE,
  typography: { heading: "Satoshi", body: "Satoshi" },
  fontLicenseConfirmed: false,
  safeFallbackFont: "Arial, Helvetica, sans-serif",
  cardStyle: "soft" as const,
  profileLayout: "editorial",
};

const id = (n: number) => demoId("storefront", n);

/** `hour`:00 in Los Angeles, `days` after `now` (the demo uses UTC-8). */
function sessionStart(now: Date, days: number, hour: number): Date {
  const day = new Date(now.getTime() + days * DAY);
  const midnight = Date.parse(`${day.toISOString().slice(0, 10)}T00:00:00Z`);
  return new Date(midnight + (hour + 8) * HOUR);
}

function localParts(at: Date) {
  const local = new Date(at.getTime() - 8 * HOUR);
  return {
    localDate: local.toISOString().slice(0, 10),
    localTime: local.toISOString().slice(11, 16),
  };
}

interface OccurrenceInput {
  readonly key: number;
  readonly days: number;
  readonly hour: number;
  readonly minutes: number;
  readonly capacity: number;
  readonly booked: number;
  readonly minimum?: number;
  readonly lockMinutes?: number;
  readonly waiting?: number;
  readonly coaches?: readonly { personId: string; displayName: string }[];
}

function occurrence(now: Date, input: OccurrenceInput) {
  const startsAt = sessionStart(now, input.days, input.hour);
  const endsAt = new Date(startsAt.getTime() + input.minutes * 60_000);
  const spotsRemaining = Math.max(0, input.capacity - input.booked);
  const minimum = input.minimum;
  const lockAt =
    minimum !== undefined
      ? new Date(startsAt.getTime() - (input.lockMinutes ?? 1_440) * 60_000)
      : undefined;
  return {
    key: `${id(input.key)}:${startsAt.toISOString()}`,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    ...localParts(startsAt),
    timezone: demoOrganization.timezone,
    requiredCoachCount: Math.max(1, input.coaches?.length ?? 1),
    availableCoaches: input.coaches ?? [],
    capacity: input.capacity,
    bookedCount: input.booked,
    spotsRemaining,
    ...(minimum !== undefined && lockAt
      ? {
          participation: {
            capacity: input.capacity,
            bookedCount: input.booked,
            spotsRemaining,
            minParticipants: minimum,
            minimumMet: input.booked >= minimum,
            playersNeeded: Math.max(0, minimum - input.booked),
            decisionAt: lockAt.toISOString(),
            status: "open" as const,
            lockAt: lockAt.toISOString(),
            freeCancelUntil: lockAt.toISOString(),
            ...(input.waiting ? { waitlistCount: input.waiting } : {}),
          },
        }
      : {}),
  };
}

function cardPrice(
  n: number,
  amountMinor: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id: id(n),
    audience: "everyone" as const,
    paymentKind: "card" as const,
    amountMinor,
    currency: "USD" as const,
    ...extra,
  };
}

function creditPrice(n: number, creditAmount: number) {
  return {
    id: id(n),
    audience: "everyone" as const,
    paymentKind: "credit" as const,
    creditAmount,
  };
}

const theoCoach = { personId: theo.id, displayName: theo.displayName };
const samCoach = { personId: sam.id, displayName: sam.displayName };

function southBayCatalog(now: Date) {
  return [
    {
      id: id(101),
      type: "service" as const,
      subtype: "open-play",
      slug: "evening-open-play",
      title: "Evening open play",
      shortSummary:
        "Rotating doubles on the pier courts. Come alone or bring a partner.",
      description:
        "Two hours of rotating doubles, winners stay on. Balls and nets are set up; bring water and sunscreen.",
      visibility: "public" as const,
      taxable: false,
      allowCard: true,
      allowCash: false,
      allowCredits: true,
      membershipRequired: false,
      defaultFulfillment: "booking",
      configuration: {
        bestFor: "Adults at any level who want games tonight",
        service: { durationMinutes: 120, capacity: 12 },
      },
      media: [],
      variants: [
        {
          id: id(201),
          title: "Drop-in",
          optionCoordinates: {},
          prices: [cardPrice(301, 1_500), creditPrice(302, 2)],
        },
      ],
      participation: {
        minParticipants: 4,
        maxParticipants: 12,
        minimumPolicy: "cancel" as const,
        cutoffMinutesBeforeStart: 720,
        settlementBasis: "cutoff" as const,
        creditTiers: [],
      },
      upcomingOccurrences: [
        occurrence(now, {
          key: 401,
          days: 2,
          hour: 18,
          minutes: 120,
          capacity: 12,
          booked: 6,
          minimum: 4,
          lockMinutes: 720,
        }),
        occurrence(now, {
          key: 402,
          days: 9,
          hour: 18,
          minutes: 120,
          capacity: 12,
          booked: 2,
          minimum: 4,
          lockMinutes: 720,
        }),
      ],
    },
    {
      id: id(102),
      type: "service" as const,
      subtype: "clinic",
      slug: "serve-receive-clinic",
      title: "Serve-receive clinic",
      shortSummary:
        "Ninety minutes on passing to target, with a coach and a small group.",
      description:
        "Platform angles, footwork to the ball and calling the seam. Every rep ends with a target, so you leave knowing what changed.",
      visibility: "public" as const,
      taxable: false,
      allowCard: true,
      allowCash: false,
      allowCredits: true,
      membershipRequired: false,
      defaultFulfillment: "booking",
      configuration: {
        bestFor: "Players who can keep a rally going and want cleaner passing",
        service: { durationMinutes: 90, capacity: 12 },
      },
      media: [],
      variants: [
        {
          id: id(203),
          title: "Clinic place",
          optionCoordinates: {},
          prices: [cardPrice(303, 3_500), creditPrice(304, 3)],
        },
      ],
      participation: {
        minParticipants: 4,
        maxParticipants: 12,
        minimumPolicy: "cancel" as const,
        cutoffMinutesBeforeStart: 1_440,
        settlementBasis: "cutoff" as const,
        reservedCreditsPerPlayer: 3,
        creditTiers: [
          {
            minParticipants: 4,
            maxParticipants: 7,
            creditsPerPlayer: 3,
            label: "4–7 players",
            description: "3 credits each",
          },
          {
            minParticipants: 8,
            maxParticipants: 12,
            creditsPerPlayer: 2,
            label: "8–12 players",
            description: "2 credits each",
          },
        ],
      },
      upcomingOccurrences: [
        occurrence(now, {
          key: 403,
          days: 3,
          hour: 17,
          minutes: 90,
          capacity: 12,
          booked: 9,
          minimum: 4,
          coaches: [theoCoach],
        }),
        occurrence(now, {
          key: 404,
          days: 10,
          hour: 17,
          minutes: 90,
          capacity: 12,
          booked: 3,
          minimum: 4,
          coaches: [theoCoach],
        }),
      ],
    },
    {
      id: id(103),
      type: "service" as const,
      subtype: "private-lesson",
      slug: "private-lesson-theo-park",
      title: "Private lesson with Theo Park",
      shortSummary: "One hour, one player or a pair, built around your game.",
      visibility: "public" as const,
      taxable: false,
      allowCard: true,
      allowCash: false,
      allowCredits: false,
      membershipRequired: false,
      defaultFulfillment: "booking",
      configuration: {
        service: { durationMinutes: 60, capacity: 1 },
      },
      media: [],
      variants: [
        {
          id: id(204),
          title: "One hour",
          optionCoordinates: {},
          prices: [cardPrice(305, 9_000)],
        },
      ],
      upcomingOccurrences: [
        occurrence(now, {
          key: 405,
          days: 1,
          hour: 9,
          minutes: 60,
          capacity: 1,
          booked: 0,
          coaches: [theoCoach],
        }),
        occurrence(now, {
          key: 406,
          days: 4,
          hour: 9,
          minutes: 60,
          capacity: 1,
          booked: 0,
          coaches: [theoCoach],
        }),
      ],
    },
    {
      id: id(104),
      type: "service" as const,
      subtype: "group-training",
      slug: "small-group-training",
      title: "Small-group training",
      shortSummary: "Six players, one coach, a plan for the whole hour.",
      visibility: "public" as const,
      taxable: false,
      allowCard: true,
      allowCash: false,
      allowCredits: true,
      membershipRequired: false,
      defaultFulfillment: "booking",
      configuration: {
        service: { durationMinutes: 60, capacity: 6 },
      },
      media: [],
      variants: [
        {
          id: id(205),
          title: "Group place",
          optionCoordinates: {},
          prices: [cardPrice(306, 4_000), creditPrice(307, 4)],
        },
      ],
      participation: {
        minParticipants: 3,
        maxParticipants: 6,
        minimumPolicy: "cancel" as const,
        cutoffMinutesBeforeStart: 1_440,
        settlementBasis: "cutoff" as const,
        creditTiers: [],
      },
      upcomingOccurrences: [
        occurrence(now, {
          key: 407,
          days: 5,
          hour: 18,
          minutes: 60,
          capacity: 6,
          booked: 6,
          minimum: 3,
          waiting: 2,
          coaches: [samCoach],
        }),
      ],
    },
    {
      id: id(105),
      type: "plan" as const,
      subtype: "membership",
      slug: "south-bay-membership",
      title: "South Bay membership",
      shortSummary:
        "Member prices, early booking and two guest passes a month.",
      description:
        "Membership renews until you cancel. You can cancel any time before the next renewal from your Duna wallet.",
      visibility: "public" as const,
      taxable: false,
      allowCard: true,
      allowCash: false,
      allowCredits: false,
      membershipRequired: false,
      defaultFulfillment: "membership",
      configuration: {
        membership: {
          benefits: [
            "Member price on open play",
            "Book sessions 48 hours before everyone else",
            "Two guest passes a month",
          ],
        },
      },
      media: [],
      variants: [
        {
          id: id(206),
          title: "Monthly",
          optionCoordinates: {},
          prices: [cardPrice(308, 4_500, { recurringInterval: "month" })],
        },
        {
          id: id(207),
          title: "Annual",
          optionCoordinates: {},
          prices: [cardPrice(309, 48_000, { recurringInterval: "year" })],
        },
      ],
      upcomingOccurrences: [],
    },
    {
      id: id(106),
      type: "plan" as const,
      subtype: "credit-pack",
      slug: "ten-credit-pack",
      title: "Ten-credit pack",
      shortSummary: "Ten credits for open play, clinics and group training.",
      visibility: "public" as const,
      taxable: false,
      allowCard: true,
      allowCash: false,
      allowCredits: false,
      membershipRequired: false,
      defaultFulfillment: "credits",
      configuration: { creditsGranted: 10, validityDays: 180 },
      media: [],
      variants: [
        {
          id: id(208),
          title: "Ten credits",
          optionCoordinates: {},
          prices: [cardPrice(310, 12_000)],
        },
      ],
      upcomingOccurrences: [],
    },
    {
      id: id(107),
      type: "good" as const,
      subtype: "apparel",
      slug: "club-practice-jersey",
      title: "Club practice jersey",
      shortSummary: "Light, quick-drying and cut for the sand.",
      visibility: "public" as const,
      taxable: true,
      allowCard: true,
      allowCash: true,
      allowCredits: false,
      membershipRequired: false,
      defaultFulfillment: "pickup",
      configuration: {},
      media: [],
      variants: [
        {
          id: id(209),
          title: "Small",
          optionCoordinates: { Size: "S" },
          prices: [cardPrice(311, 3_200)],
          availableQuantity: 4,
        },
        {
          id: id(210),
          title: "Medium",
          optionCoordinates: { Size: "M" },
          prices: [cardPrice(312, 3_200)],
          availableQuantity: 0,
        },
        {
          id: id(211),
          title: "Large",
          optionCoordinates: { Size: "L" },
          prices: [cardPrice(313, 3_200)],
          availableQuantity: 2,
        },
      ],
      upcomingOccurrences: [],
    },
  ];
}

function storefrontVenues(slice: typeof demoVenues) {
  return slice.map((venue, index) => ({
    id: venue.id,
    slug: venue.name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, ""),
    name: venue.name,
    amenities: [...venue.tags],
    addressLine1: index === 0 ? "1 Manhattan Beach Blvd" : undefined,
    locality: venue.city,
    administrativeArea: venue.region,
    countryCode: "US",
    latitude: venue.latitude,
    longitude: venue.longitude,
    courtCount: venue.courtCount,
  }));
}

/**
 * The storefront for a demo club, or `undefined` for any other slug (the
 * page's not-found state).
 */
export function demoOrganizationStorefront(slug: string, now: Date) {
  if (slug === demoOrganization.slug) {
    return {
      organizationId: demoOrganization.id,
      slug: demoOrganization.slug,
      name: demoOrganization.name,
      currency: "USD" as const,
      timezone: demoOrganization.timezone,
      paymentsReady: true,
      theme: {
        ...DEFAULT_THEME,
        brandDisplayName: demoOrganization.name,
        membershipProgramName: "South Bay membership",
        tagline:
          "Beach volleyball on the South Bay piers, every day of the week.",
        profileSummary:
          "Open play, clinics and coaching for adults and juniors across three venues from Manhattan Beach to El Segundo.",
        heroMediaType: "image" as const,
        heroMediaUrl: "/site/courts-first-light.webp",
        palette: {
          ...DEFAULT_PALETTE,
          primary: "#1F6F78",
          accent: "#9FCFD3",
        },
        cardStyle: "crisp" as const,
        profileLayout: "editorial",
        publishedAt: "2026-09-01T16:00:00.000Z",
      },
      catalog: southBayCatalog(now),
      contact: {
        email: "hello@southbay.example",
        addressLine1: "1 Manhattan Beach Blvd",
        locality: "Manhattan Beach",
        administrativeArea: "CA",
        postalCode: "90266",
        countryCode: "US",
        latitude: demoVenues[0]!.latitude,
        longitude: demoVenues[0]!.longitude,
      },
      venues: storefrontVenues(demoVenues),
    };
  }
  if (slug === "pier-avenue-sand-club") {
    return {
      organizationId: id(1),
      slug,
      name: "Pier Avenue Sand Club",
      currency: "USD" as const,
      timezone: demoOrganization.timezone,
      paymentsReady: true,
      theme: DEFAULT_THEME,
      catalog: southBayCatalog(now)
        .filter((item) => item.subtype === "open-play")
        .map((item) => ({ ...item, id: id(111), slug: "sunday-open-play" })),
      contact: {
        locality: "Hermosa Beach",
        administrativeArea: "CA",
        countryCode: "US",
      },
      venues: storefrontVenues(demoVenues.slice(1, 2)),
    };
  }
  if (slug === "northside-indoor-collective") {
    return {
      organizationId: id(2),
      slug,
      name: "Northside Indoor Collective",
      currency: "USD" as const,
      timezone: demoOrganization.timezone,
      paymentsReady: false,
      theme: DEFAULT_THEME,
      catalog: [],
      contact: { countryCode: "US" },
      venues: [],
    };
  }
  return undefined;
}

/** The demo club slugs with a storefront (tests walk them). */
export const demoStorefrontSlugs = [
  demoOrganization.slug,
  "pier-avenue-sand-club",
  "northside-indoor-collective",
] as const;
