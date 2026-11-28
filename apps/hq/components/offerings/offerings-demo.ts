/**
 * The demo club's offerings and their sessions (demo mode only: no Duna
 * Database). The demo catalog the API returns is empty, so without these the
 * offering pages could not be seen at all. Sessions are the participation
 * fixtures (`@duna/core/demo/participation`, one per display state) attached
 * to the offerings they belong to, plus two clinics that show a merge being
 * offered and one being refused because it would raise a price. Every price
 * is illustrative; every person is a demo person.
 */
import { demoOrganization, demoPeople } from "@duna/core/demo";
import { demoId } from "@duna/core/demo/ids";
import { participationDemo } from "@duna/core/demo/participation";
import {
  participationDisplay,
  participationLockAt,
  readParticipationRuleV2,
  resolveParticipationRuleV2,
} from "@duna/core";
import type { OfferingItem } from "./offering-model";
import type { OperatorOccurrence } from "../participation/session-model";

export const DEMO_NOW = participationDemo.now;
const now = new Date(DEMO_NOW);
const zone = demoOrganization.timezone;
const currency = "USD" as const;
const updatedAt = "2026-11-20T17:00:00.000Z";

export const demoOfferingIds = {
  semiPrivate: demoId("participation", 101),
  clinic: demoId("participation", 102),
  smallGroup: demoId("participation", 103),
  openPlay: demoId("participation", 104),
  privateLesson: demoId("participation", 105),
  membership: demoId("participation", 106),
  creditPack: demoId("participation", 107),
  shirt: demoId("participation", 108),
  program: demoId("participation", 109),
} as const;

const library = (name: string, alt: string) => ({
  id: demoId("participation", 900 + name.length),
  kind: "image" as const,
  url: `/media/product-library/duna-product-${name}.webp`,
  alt,
});

let priceSequence = 1_000;
function price(
  paymentKind: "card" | "cash" | "credit",
  amount: number,
  recurringInterval?: "month" | "year",
) {
  priceSequence += 1;
  return {
    id: demoId("participation", priceSequence),
    audience: "everyone" as const,
    paymentKind,
    ...(paymentKind === "credit"
      ? { creditAmount: amount }
      : { amountMinor: amount, currency }),
    ...(recurringInterval
      ? { recurringInterval, recurringIntervalCount: 1 }
      : {}),
    active: true,
  };
}

function recurring(weekday: number, startTime: string) {
  return {
    mode: "recurring",
    timezone: zone,
    startsOn: "2026-12-01",
    endsOn: "2027-01-31",
    weekdays: [weekday],
    startTime,
    weekly: [{ weekday, startsAt: startTime }],
    blackoutDates: [],
  };
}

function service(input: {
  readonly id: string;
  readonly subtype: string;
  readonly title: string;
  readonly summary: string;
  readonly capacity: number;
  readonly duration: number;
  readonly schedule: Record<string, unknown>;
  readonly participation?: Record<string, unknown> | null;
  readonly cardMinor?: number;
  readonly credits?: number;
  readonly status?: OfferingItem["status"];
  readonly media?: OfferingItem["media"];
}): OfferingItem {
  const prices = [
    ...(input.cardMinor !== undefined ? [price("card", input.cardMinor)] : []),
    ...(input.credits !== undefined ? [price("credit", input.credits)] : []),
  ];
  return {
    id: input.id,
    type: "service",
    subtype: input.subtype,
    slug: input.title.toLowerCase().replaceAll(" ", "-"),
    title: input.title,
    shortSummary: input.summary,
    status: input.status ?? "active",
    visibility: "public",
    taxable: false,
    allowCard: input.cardMinor !== undefined,
    allowCash: false,
    allowCredits: input.credits !== undefined,
    membershipRequired: false,
    defaultFulfillment: "session",
    configuration: {
      source: "demo",
      capacity: input.capacity,
      durationMinutes: input.duration,
      sessionSchedule: input.schedule,
      deliveryMode: "venue",
      coachAssignmentMode: "all",
      requiredCoachCount: 1,
      customerCoachSelection: true,
      bestFor: "Players who want regular coached reps.",
      highlights: ["Coached drills", "Game play to finish"],
      service: {
        durationMinutes: input.duration,
        capacity: input.capacity,
        bookingLeadHours: 12,
        bookingBufferMinutes: 15,
        schedulingStyle: "coach-availability",
        sessionSchedule: input.schedule,
      },
      ...(input.participation !== undefined
        ? { participation: input.participation }
        : {}),
    },
    variants: [
      {
        id: demoId("participation", 700 + Number(input.id.slice(-3))),
        title: input.title,
        optionCoordinates: {},
        status: "active",
        prices,
      },
    ],
    media: input.media ?? [],
    inventoryOnHand: 0,
    inventoryReserved: 0,
    ...(input.status === "draft" ? {} : { publishedAt: updatedAt }),
    updatedAt,
  };
}

const shirtVariants = ["S", "M", "L"].map((size, index) => ({
  id: demoId("participation", 801 + index),
  title: `Club shirt · ${size}`,
  sku: `CLUB_SHIRT-00${index + 1}`,
  optionCoordinates: { size },
  status: "active" as const,
  prices: [price("card", 3_000)],
}));

/** The demo club's catalog. */
export const demoOfferings: readonly OfferingItem[] = [
  service({
    id: demoOfferingIds.semiPrivate,
    subtype: "group-lesson",
    title: "Saturday semi-private",
    summary: "Two players, one coach, Saturday mornings.",
    capacity: 2,
    duration: 60,
    schedule: recurring(6, "09:00"),
    participation: {
      version: 2,
      unit: "player",
      minParticipants: 2,
      minimumPolicy: "cancel",
      lockMinutesBeforeStart: 1_440,
      waitlist: false,
      tiers: [],
    },
    cardMinor: 7_000,
    credits: 4,
    media: [library("private-lesson", "A coach working with two players")],
  }),
  service({
    id: demoOfferingIds.clinic,
    subtype: "group-lesson",
    title: "Weekly clinic",
    summary: "Four to twelve players; the price drops as the group grows.",
    capacity: 12,
    duration: 90,
    schedule: recurring(4, "18:00"),
    participation: {
      version: 2,
      unit: "player",
      minParticipants: 4,
      minimumPolicy: "cancel",
      lockMinutesBeforeStart: 1_440,
      waitlist: true,
      tiers: [
        { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
        { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 2 },
      ],
    },
    cardMinor: 4_500,
    credits: 3,
    media: [library("group-lesson", "A group clinic on the sand")],
  }),
  service({
    id: demoOfferingIds.smallGroup,
    subtype: "group-lesson",
    title: "Small group training",
    summary: "Three to six players; uses the club's booking rule.",
    capacity: 6,
    duration: 90,
    schedule: recurring(3, "17:30"),
    cardMinor: 4_000,
    credits: 3,
  }),
  service({
    id: demoOfferingIds.openPlay,
    subtype: "group-lesson",
    title: "Saturday open play",
    summary: "Coached open play for four to six.",
    capacity: 6,
    duration: 120,
    schedule: recurring(6, "13:00"),
    participation: {
      version: 2,
      unit: "player",
      minParticipants: 4,
      minimumPolicy: "cancel",
      lockMinutesBeforeStart: 720,
      waitlist: true,
      tiers: [],
    },
    cardMinor: 2_000,
    credits: 2,
  }),
  service({
    id: demoOfferingIds.privateLesson,
    subtype: "private-lesson",
    title: "Private lesson",
    summary: "One player, booked from your coaches' availability.",
    capacity: 1,
    duration: 60,
    schedule: { mode: "flexible", timezone: zone },
    cardMinor: 9_000,
    credits: 6,
    media: [library("private-lesson", "A coach and one player")],
  }),
  {
    id: demoOfferingIds.membership,
    type: "plan",
    subtype: "membership",
    slug: "club-membership",
    title: "Club membership",
    shortSummary: "Member prices, priority booking and two credits a month.",
    status: "active",
    visibility: "public",
    taxable: false,
    allowCard: true,
    allowCash: false,
    allowCredits: false,
    membershipRequired: false,
    defaultFulfillment: "membership",
    configuration: {
      source: "demo",
      membership: {
        billingMode: "monthly",
        includedCreditsPerCycle: 2,
        bookingLimitPerCycle: 0,
        includedCatalogItemIds: [],
        waiverDocumentIds: [],
        benefits: ["Priority booking", "Two credits every month"],
      },
    },
    variants: [
      {
        id: demoId("participation", 811),
        title: "Club membership",
        optionCoordinates: {},
        status: "active",
        prices: [price("card", 12_000, "month")],
      },
    ],
    media: [library("club-community", "Club members after morning play")],
    inventoryOnHand: 0,
    inventoryReserved: 0,
    publishedAt: updatedAt,
    updatedAt,
  },
  {
    id: demoOfferingIds.creditPack,
    type: "plan",
    subtype: "credit-pack",
    slug: "ten-credit-pack",
    title: "Ten-credit pack",
    shortSummary: "Ten credits for lessons and groups.",
    status: "active",
    visibility: "public",
    taxable: false,
    allowCard: true,
    allowCash: false,
    allowCredits: false,
    membershipRequired: false,
    defaultFulfillment: "credit-grant",
    configuration: { source: "demo", creditsGranted: 10, validityDays: 180 },
    variants: [
      {
        id: demoId("participation", 812),
        title: "Ten-credit pack",
        optionCoordinates: {},
        status: "active",
        prices: [price("card", 35_000)],
      },
    ],
    media: [],
    inventoryOnHand: 0,
    inventoryReserved: 0,
    publishedAt: updatedAt,
    updatedAt,
  },
  {
    id: demoOfferingIds.shirt,
    type: "good",
    subtype: "apparel",
    slug: "club-shirt",
    title: "Club shirt",
    shortSummary: "The club's training shirt.",
    status: "draft",
    visibility: "public",
    taxable: true,
    allowCard: true,
    allowCash: true,
    allowCredits: false,
    membershipRequired: false,
    defaultFulfillment: "pickup",
    configuration: {
      source: "demo",
      saleEnabled: true,
      inventoryTracked: true,
      inventoryCostingMethod: "fifo",
      variantCount: 3,
    },
    variants: shirtVariants,
    // One photo for every size and one for size M only.
    media: [
      library("club-apparel", "The club shirt"),
      {
        id: demoId("participation", 950),
        catalogVariantId: shirtVariants[1]!.id,
        kind: "image",
        url: "/media/product-library/duna-product-club-apparel.webp",
        alt: "The club shirt in size M",
      },
    ],
    inventoryOnHand: 24,
    inventoryReserved: 2,
    updatedAt,
  },
  service({
    id: demoOfferingIds.program,
    subtype: "program",
    title: "Junior development program",
    summary: "Eight weeks of coached sessions for juniors.",
    capacity: 8,
    duration: 90,
    schedule: { mode: "flexible", timezone: zone },
    status: "draft",
  }),
];

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const quotes = participationDemo.quotes;
const offeringForSession: Readonly<Record<number, string>> = {
  1: demoOfferingIds.semiPrivate,
  2: demoOfferingIds.clinic,
  3: demoOfferingIds.smallGroup,
  4: demoOfferingIds.clinic,
  5: demoOfferingIds.smallGroup,
  6: demoOfferingIds.openPlay,
  7: demoOfferingIds.clinic,
  8: demoOfferingIds.clinic,
  9: demoOfferingIds.clinic,
  10: demoOfferingIds.privateLesson,
};

const methods = ["credit", "card", "credit", "cash", "credit"] as const;

/** Places spread over the demo people (a parent booking twins holds 2). */
function roster(
  session: number,
  booked: number,
  reservePerPlace: number,
  attendance?: "attended",
) {
  const bookings: OperatorOccurrence["bookings"][number][] = [];
  const doubled = Math.max(0, booked - demoPeople.length);
  let left = booked;
  let index = 0;
  while (left > 0 && index < demoPeople.length) {
    const person = demoPeople[index]!;
    const places = Math.min(left, index < doubled ? 2 : 1);
    const method = methods[index % methods.length]!;
    bookings.push({
      fulfillmentId: demoId("participation", 2_000 + session * 20 + index),
      orderId: demoId("participation", 3_000 + session * 20 + index),
      personId: person.id,
      displayName: person.displayName,
      payerPersonId: person.id,
      quantity: places,
      paymentMethod: method,
      confirmed: true,
      reservedCredits: method === "credit" ? reservePerPlace * places : 0,
      ...(attendance ? { attendance } : {}),
    });
    left -= places;
    index += 1;
  }
  return bookings;
}

function occurrence(input: {
  readonly id: string;
  readonly catalogItemId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly capacity: number;
  readonly booked: number;
  readonly min: number;
  readonly policy: "cancel" | "run";
  readonly lockAt?: string;
  readonly displayState: string;
  readonly waiting: number;
  readonly reserve: number;
  readonly session: number;
  readonly status?: OperatorOccurrence["status"];
}): OperatorOccurrence {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  const ended = endsAt.getTime() <= now.getTime();
  return {
    id: input.id,
    catalogItemId: input.catalogItemId,
    title: input.title,
    startsAt: input.startsAt,
    endsAt: endsAt.toISOString(),
    timezone: zone,
    status: input.status ?? (ended ? "complete" : "scheduled"),
    capacity: input.capacity,
    confirmedCount: input.booked,
    participation: {
      capacity: input.capacity,
      bookedCount: input.booked,
      spotsRemaining: Math.max(0, input.capacity - input.booked),
      minParticipants: input.min,
      minimumMet: input.booked >= input.min,
      playersNeeded: Math.max(0, input.min - input.booked),
      decisionAt: input.lockAt ?? input.startsAt,
      status: "open",
      displayState: input.displayState as never,
      ...(input.lockAt
        ? { lockAt: input.lockAt, freeCancelUntil: input.lockAt }
        : {}),
      waitlistCount: input.waiting,
      heldCount: 0,
      minimumPolicy: input.policy,
      settlementBasis: "cutoff",
      atStakeCredits: input.reserve * input.booked,
      atStakeMinor: 0,
    },
    bookings: roster(
      input.session,
      input.booked,
      input.reserve,
      ended && input.displayState === "settled" ? "attended" : undefined,
    ),
  };
}

const reserves: Readonly<Record<string, number>> = {
  [demoOfferingIds.semiPrivate]: 4,
  [demoOfferingIds.clinic]: 3,
  [demoOfferingIds.smallGroup]: 3,
  [demoOfferingIds.openPlay]: 2,
  [demoOfferingIds.privateLesson]: 6,
};

function quoteSession(quote: (typeof quotes)[number], n: number) {
  const catalogItemId = offeringForSession[n]!;
  const numbers = quote.display.numbers;
  return occurrence({
    id: quote.subjectId,
    catalogItemId,
    title: quote.title,
    startsAt: quote.startsAt,
    capacity: numbers.capacity,
    booked: numbers.booked,
    min: numbers.minimum,
    policy: "cancel",
    lockAt: quote.lockAt,
    displayState:
      quote.displayState === "open" ? "minimum-reached" : quote.displayState,
    waiting: numbers.waiting,
    reserve: reserves[catalogItemId] ?? 3,
    session: n,
    status: quote.displayState === "cancelled-club" ? "cancelled" : undefined,
  });
}

/** A clinic built here, with its state from the shared display. */
function extraClinic(input: {
  readonly n: number;
  readonly title: string;
  readonly startsInHours: number;
  readonly booked: number;
  readonly reserve: number;
}) {
  const rule = resolveParticipationRuleV2(
    readParticipationRuleV2(demoOfferings[1]!.configuration.participation)!,
    { capacity: 12 },
  );
  const startsAt = new Date(now.getTime() + input.startsInHours * 3_600_000);
  const lockAt = participationLockAt({
    startsAt,
    lockMinutesBeforeStart: rule.lockMinutesBeforeStart,
  });
  const display = participationDisplay({
    rule,
    capacity: 12,
    booked: input.booked,
    lockAt,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 90 * 60_000),
    now,
    timeZone: zone,
  });
  return occurrence({
    id: demoId("participation", input.n),
    catalogItemId: demoOfferingIds.clinic,
    title: input.title,
    startsAt: startsAt.toISOString(),
    capacity: 12,
    booked: input.booked,
    min: 4,
    policy: "cancel",
    lockAt: lockAt.toISOString(),
    displayState: display.state,
    waiting: 0,
    reserve: input.reserve,
    session: input.n,
  });
}

/** Every demo session, earliest first. */
export const demoOccurrences: readonly OperatorOccurrence[] = [
  ...quotes.map((quote, index) => quoteSession(quote, index + 1)),
  // Three players who could join Thursday's clinic: a merge is offered.
  extraClinic({
    n: 11,
    title: "Friday clinic",
    startsInHours: 80,
    booked: 3,
    reserve: 3,
  }),
  // Booked under an older, dearer ladder: merging into it is refused.
  extraClinic({
    n: 12,
    title: "Sunday morning clinic",
    startsInHours: 120,
    booked: 5,
    reserve: 4,
  }),
].sort((left, right) => left.startsAt.localeCompare(right.startsAt));

export const demoSessionIds = {
  semiPrivate: quotes[0]!.subjectId,
  thursdayClinic: quotes[1]!.subjectId,
  sundayClinicDone: quotes[8]!.subjectId,
  mondayMorningClinic: quotes[7]!.subjectId,
  fridayClinic: demoId("participation", 11),
  sundayMorningClinic: demoId("participation", 12),
} as const;

export const demoCoachNames = ["Coach Rivera"] as const;
