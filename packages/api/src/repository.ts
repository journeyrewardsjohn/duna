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
import type { DunaRepository } from "./repository-contract";

const mutableEvents: EventSummary[] = [...demoEvents];
const mutableMatches: MatchSummary[] = [...demoMatches];

export const demoRepository = {
  public: {
    events: () => [...mutableEvents],
    eventBySlug: (slug: string) =>
      mutableEvents.find((event) => event.slug === slug),
    venues: () => demoVenues,
    playerByHandle: (handle: string) =>
      demoPeople.find((person) => person.handle === handle),
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
    quote: (input: {
      items: readonly PricedOrderItem[];
      isDunaPlus: boolean;
    }) =>
      priceConsumerOrder({
        items: input.items,
        currency: "USD",
        isDunaPlus: input.isDunaPlus,
      }),
    createPickup: (input: {
      title: string;
      startsAt: string;
      endsAt: string;
      venueName: string;
      capacity: number;
      ratingMinimum?: number;
      ratingMaximum?: number;
    }): EventSummary => {
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
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: "America/Los_Angeles",
        price: { amountMinor: 0, currency: "USD" },
        spotsRemaining: Math.max(0, input.capacity - 1),
        capacity: input.capacity,
        ratingRange:
          input.ratingMinimum !== undefined && input.ratingMaximum !== undefined
            ? [input.ratingMinimum, input.ratingMaximum]
            : undefined,
        tags: ["Pickup", "Hosted"],
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
        { service: "Stripe webhooks", status: "healthy", detail: "p95 4.2s" },
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
