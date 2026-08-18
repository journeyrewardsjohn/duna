import {
  withEventLifecycle,
  type EventSummary,
  type MatchSummary,
} from "@duna/core";
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
import { membershipPlanOffers } from "./membership";
import type {
  DunaRepository,
  PickupMutationInput,
} from "./repository-contract";

const mutableEvents: EventSummary[] = [...demoEvents];
const mutableMatches: MatchSummary[] = [...demoMatches];

export const demoRepository = {
  public: {
    events: () => mutableEvents.map((event) => withEventLifecycle(event)),
    eventBySlug: (slug: string) =>
      mutableEvents
        .filter((event) => event.slug === slug)
        .map((event) => withEventLifecycle(event))[0],
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
      events: mutableEvents.map((event) => withEventLifecycle(event)),
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
      publicIdentity: {
        tier: "verified-pro" as const,
        accentId: "dune-gold" as const,
      },
      sourceConnections: [],
      voiceOnboarding: {
        configured: Boolean(
          process.env.LIVEKIT_URL &&
          process.env.LIVEKIT_API_KEY &&
          process.env.LIVEKIT_API_SECRET,
        ),
        aiConfigured: Boolean(
          process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
        ),
      },
      household: [],
      dunaPlus: {
        active: true,
        kind: "complimentary" as const,
        plan: "premium-plus" as const,
        label: "Complimentary Premium+",
      },
      dunaPlusPlans: membershipPlanOffers(),
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
        approvalRequired: input.approvalRequired,
        visibility: input.visibility,
        lifecycleStatus: "active",
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
    organization: (organizationId: string) =>
      organizationId === demoOrganization.id
        ? {
            organization: demoOrganization,
            canManageCommission: false,
            metrics: [
              {
                label: "Gross volume",
                value: "$0",
                change: "Demo data source",
              },
              {
                label: "People",
                value: String(demoPeople.length),
                change: `${demoOrganization.staffCount} staff`,
              },
              {
                label: "Venues + courts",
                value: `${demoVenues.length} / ${demoVenues.reduce(
                  (total, venue) => total + venue.courtCount,
                  0,
                )}`,
                change: "Connected inventory",
              },
              {
                label: "Upcoming activity",
                value: String(mutableEvents.length),
                change: "Demo schedule",
              },
            ],
            people: demoPeople,
            venues: demoVenues,
            events: mutableEvents,
            audit: demoAuditEvents,
            billing: {
              configuredPlan: "club",
              effectivePlan: "club",
              subscriptionStatus: "active",
              interval: "month",
              cancelAtPeriodEnd: false,
              commission: {
                organizationId: demoOrganization.id,
                configuredPlan: "club",
                effectivePlan: "club",
                subscriptionStatus: "active",
                defaultRateBps: 0,
                rateBps: 0,
                source: "plan-default",
                stripeSyncStatus: "synced",
              },
            },
            commerce: {
              paidOrders: 0,
              pendingOrders: 0,
              refundedOrders: 0,
              grossVolumeMinor: 0,
              currency: "USD",
            },
          }
        : undefined,
    players: (query: string | undefined, limit: number) => {
      const normalized = query?.trim().toLowerCase();
      return demoPeople
        .filter(
          (person) =>
            !normalized ||
            person.displayName.toLowerCase().includes(normalized) ||
            person.handle.toLowerCase().includes(normalized),
        )
        .slice(0, limit);
    },
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
