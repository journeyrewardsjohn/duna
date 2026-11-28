/**
 * Demo fixtures: fees (Duna Premium and up-front fee quotes; owner: B2 with
 * the checkout owners). One quote per checkout surface and one Premium
 * subscription per status, store and interval, with every event kind.
 * Shaped by `contracts/fees.ts`; parsed in packages/api/src/contracts/fees.test.ts.
 *
 * Every amount and plan key here is a DEMO PLACEHOLDER (the plan figures
 * mirror the DP-Intro board example), never Duna's published prices or
 * policy: real values come from @duna/pricing and the owner's plan table.
 */
import { demoOrganization, demoPeople, demoPlayer } from "../demo";
import { demoId } from "./ids";

const USD = "USD" as const;
const usd = (amountMinor: number) => ({ amountMinor, currency: USD });

const surfaces = [
  "web-checkout",
  "player-app",
  "pro-app",
  "hq-point-of-sale",
  "public-page",
] as const;

const quote = (
  n: number,
  surface: (typeof surfaces)[number],
  subtotalMinor: number,
  premiumApplied: boolean,
) => {
  const serviceFee = premiumApplied ? 0 : Math.round(subtotalMinor * 0.03);
  const tax = 0;
  return {
    id: demoId("fees", 1 + n),
    organizationId: demoOrganization.id,
    catalogItemId: demoId("fees", 50 + n),
    surface,
    subtotal: usd(subtotalMinor),
    serviceFee: usd(serviceFee),
    organizationFee: usd(Math.round(subtotalMinor * 0.025)),
    processingEstimate: usd(Math.round(subtotalMinor * 0.03) + 35),
    tax: usd(tax),
    total: usd(subtotalMinor + serviceFee + tax),
    premiumApplied,
    feeRuleVersion: "demo-2026-11",
    lines: [
      {
        label: "Court 2 · 90 min",
        amount: usd(subtotalMinor),
        kind: "item" as const,
      },
      {
        label: "Service fee",
        amount: usd(serviceFee),
        kind: "service-fee" as const,
      },
    ],
    shownAt: "2026-11-27T18:00:00.000Z",
    expiresAt: "2026-11-27T18:15:00.000Z",
  };
};

export const feesDemoQuotes = surfaces.map((surface, index) =>
  quote(index, surface, 6_000 + index * 1_000, index === 1),
);

const people = [demoPlayer, ...demoPeople];
const statuses = [
  "trialing",
  "active",
  "grace-period",
  "past-due",
  "cancel-at-period-end",
  "expired",
  "revoked",
  "refunded",
] as const;
const stores = ["duna-pay", "apple-app-store", "google-play"] as const;
const eventKinds = [
  "started",
  "trial-started",
  "renewed",
  "renewal-reminder-sent",
  "price-change-notice-sent",
  "trial-ending-reminder-sent",
  "payment-failed",
  "grace-period-started",
  "cancel-requested",
  "cancel-undone",
  "expired",
  "refunded",
  "revoked",
  "store-changed",
] as const;

const subscription = (index: number) => {
  const status = statuses[index]!;
  const store = stores[index % stores.length]!;
  const interval = index % 2 === 0 ? ("month" as const) : ("year" as const);
  const ended =
    status === "expired" || status === "revoked" || status === "refunded";
  return {
    id: demoId("fees", 100 + index),
    personId: people[index % people.length]!.id,
    store,
    planKey: interval === "month" ? "premium-demo-month" : "premium-demo-year",
    status,
    billingInterval: interval,
    price: usd(interval === "month" ? 999 : 9_900),
    autoRenews: !ended && status !== "cancel-at-period-end",
    ...(status === "trialing"
      ? { trialEndsAt: "2026-12-04T00:00:00.000Z" }
      : {}),
    currentPeriodStartsAt: "2026-11-04T00:00:00.000Z",
    currentPeriodEndsAt:
      interval === "month"
        ? "2026-12-04T00:00:00.000Z"
        : "2027-11-04T00:00:00.000Z",
    ...(status === "grace-period"
      ? { gracePeriodEndsAt: "2026-12-11T00:00:00.000Z" }
      : {}),
    ...(status === "cancel-at-period-end"
      ? { cancelRequestedAt: "2026-11-20T00:00:00.000Z" }
      : {}),
    ...(ended ? { endedAt: "2026-11-25T00:00:00.000Z" } : {}),
    ...(status === "active"
      ? {
          pendingPrice: usd(10_900),
          pendingPriceEffectiveAt: "2027-11-04T00:00:00.000Z",
        }
      : {}),
    managedIn:
      store === "duna-pay"
        ? ("duna" as const)
        : store === "apple-app-store"
          ? ("app-store" as const)
          : ("google-play" as const),
    events: eventKinds
      .filter(
        (_, eventIndex) =>
          eventIndex % statuses.length === index || eventIndex === index + 8,
      )
      .map((kind, eventIndex) => ({
        id: demoId("fees", 200 + index * 20 + eventIndex),
        kind,
        occurredAt: "2026-11-20T00:00:00.000Z",
      })),
  };
};

export const feesDemoSubscriptions = statuses.map((_, index) =>
  subscription(index),
);

/** The demo player's own Premium (the `active` subscription). */
export const feesDemoPremiumState = {
  active: true,
  source: "subscription" as const,
  subscription: feesDemoSubscriptions[1]!,
};

export const feesDemoPlatformSummary = {
  organizationId: demoOrganization.id,
  planKey: "club",
  organizationFeeBps: 250,
  monthlyPlanPrice: usd(19_900),
  serviceFeeDescription: "[player service fee rule from the pricing table]",
  processingDescription: "[card processing rate from the pricing table]",
  thisMonth: {
    organizationFees: usd(39_800),
    serviceFeesCollected: usd(47_760),
  },
};

export const feesDemo = {
  domain: "fees",
  quotes: feesDemoQuotes,
  subscriptions: feesDemoSubscriptions,
  premiumState: feesDemoPremiumState,
  platformSummary: feesDemoPlatformSummary,
} as const;
