import type { EventSummary, MatchSummary } from "@duna/core";
import {
  adminMetrics,
  demoAdminQueues,
  demoAuditEvents,
  demoBookings,
  demoEvents,
  demoFeed,
  demoMatches,
  demoOperatorSchedule,
  demoOrganization,
  demoPeople,
  demoPlayer,
  demoVenues,
  demoWalletBalanceMinor,
  demoWalletEntries,
  operatorMetrics,
  playerMetrics,
} from "@duna/core/demo";
import { priceConsumerOrder, type PricedOrderItem } from "@duna/pricing";
import { isDatabaseConfigured } from "@duna/db";
import { databaseRepository } from "./database-repository";
import type {
  DunaRepository,
  PickupMutationInput,
} from "./repository-contract";

const mutableEvents: EventSummary[] = [...demoEvents];
const mutableMatches: MatchSummary[] = [...demoMatches];

export const demoRepository = {
  public: {
    events: () => [...mutableEvents],
    eventBySlug: (slug: string) =>
      mutableEvents.find((event) => event.slug === slug),
    venues: () => demoVenues,
    players: (limit: number) => demoPeople.slice(0, limit),
    playerByHandle: (handle: string) =>
      demoPeople.find((person) => person.handle === handle),
    organizationBySlug: (slug: string) =>
      slug === demoOrganization.slug ? demoOrganization : undefined,
  },
  player: {
    dashboard: () => ({
      player: demoPlayer,
      metrics: playerMetrics,
      bookings: demoBookings,
      events: mutableEvents,
      feed: demoFeed,
      recentMatches: mutableMatches.slice(0, 3),
      walletBalanceMinor: demoWalletBalanceMinor(),
      currency: "USD" as const,
    }),
    matchHistory: () => [...mutableMatches],
    wallet: () => ({
      balanceMinor: demoWalletBalanceMinor(),
      availableMinor: demoWalletBalanceMinor(),
      pendingMinor: 0,
      currency: "USD" as const,
      entries: demoWalletEntries,
      taxFormStatus: "not-required" as const,
    }),
    settings: () => ({
      profile: {
        person: demoPlayer,
        visibility: "public" as const,
        locale: "en-US",
        measurementSystem: "imperial" as const,
        ageBand: "adult" as const,
        ageVerified: false,
        parentalConsentRecorded: false,
        playingExperience: "amateur" as const,
        onboardingStatus: "complete" as const,
      },
      identityVerification: {
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        status: "not-started" as const,
      },
      sourceConnections: [],
      voiceOnboarding: {
        configured: Boolean(
          process.env.LIVEKIT_URL &&
          process.env.LIVEKIT_API_KEY &&
          process.env.LIVEKIT_API_SECRET,
        ),
        aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      },
      household: [],
      dunaPlusPlans: [
        {
          interval: "month" as const,
          priceMinor: 799,
          currency: "USD" as const,
          configured: Boolean(process.env.STRIPE_DUNA_PLUS_MONTHLY_PRICE_ID),
        },
        {
          interval: "year" as const,
          priceMinor: 5_900,
          currency: "USD" as const,
          configured: Boolean(process.env.STRIPE_DUNA_PLUS_ANNUAL_PRICE_ID),
        },
      ],
      consents: [],
      privacyRequests: [],
    }),
    quote: (input: {
      items: readonly PricedOrderItem[];
      isDunaPlus: boolean;
    }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD",
        isDunaPlus: input.isDunaPlus,
      }),
    createPickup: (input: PickupMutationInput): EventSummary => {
      const event: EventSummary = {
        id: crypto.randomUUID(),
        slug: input.title
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, "-")
          .replaceAll(/(^-|-$)/g, ""),
        title: input.title,
        kind: "pickup",
        organizationName: `Hosted by ${demoPlayer.displayName}`,
        venueName: input.venueName,
        description: input.note,
        format: input.format,
        recordMatches: input.recordMatches,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: "America/Los_Angeles",
        price: { amountMinor: input.costMinor, currency: input.currency },
        spotsRemaining: Math.max(0, input.capacity - 1),
        capacity: input.capacity,
        ratingRange:
          input.ratingMinimum !== undefined && input.ratingMaximum !== undefined
            ? [input.ratingMinimum, input.ratingMaximum]
            : undefined,
        tags: [
          "Pickup",
          input.matchType === "competitive" ? "Competitive" : "Casual",
          input.genderPreference === "open"
            ? "All players"
            : input.genderPreference,
          input.format === "king-queen" ? "King / Queen" : input.format,
          input.costMinor === 0 ? "Free" : "Paid",
        ],
      };
      mutableEvents.unshift(event);
      return event;
    },
  },
  operator: {
    dashboard: () => ({
      organization: demoOrganization,
      metrics: operatorMetrics,
      schedule: demoOperatorSchedule,
      events: mutableEvents,
      alerts: [
        {
          id: "weather",
          title: "Wind advisory after 4:30 PM",
          detail: "Two evening blocks may need a court rotation.",
          action: "Review schedule",
          tone: "warning",
        },
        {
          id: "purse",
          title: "Purse funding ready",
          detail: "$1,500 is reserved for the Sunset Open.",
          action: "View payout table",
          tone: "positive",
        },
      ],
    }),
    schedule: () => demoOperatorSchedule,
    organization: () => demoOrganization,
    members: () => demoPeople,
    events: () => mutableEvents,
  },
  admin: {
    overview: () => ({
      metrics: adminMetrics,
      queues: demoAdminQueues,
      audit: demoAuditEvents,
      system: [
        { service: "API", status: "healthy", detail: "p95 118ms" },
        { service: "Payment webhooks", status: "healthy", detail: "p95 4.2s" },
        { service: "Rating replay", status: "healthy", detail: "0 drift" },
        {
          service: "Wallet reconciliation",
          status: "healthy",
          detail: "$0 drift",
        },
        {
          service: "Messaging",
          status: "attention",
          detail: "SMS 10DLC pending",
        },
      ],
    }),
    organizations: () => [demoOrganization],
    queues: () => demoAdminQueues,
    audit: () => demoAuditEvents,
  },
} satisfies DunaRepository;

export function getRepository(): DunaRepository {
  if (
    isDatabaseConfigured() &&
    process.env.DUNA_DATA_SOURCE?.toLowerCase() !== "demo"
  ) {
    return databaseRepository;
  }
  return demoRepository;
}
