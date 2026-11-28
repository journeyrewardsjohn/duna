/**
 * Demo fixtures: pay (owner: B2). Duna Pay for the demo club: one account per
 * derived status, payout / refund / tax settings, and the payout-policy
 * ledger with one obligation per delivery rule (court rental, multi-day
 * event, program with a start tranche, league, membership in its refund
 * window, credit pack with reserve, goods with ship-by and tracking, a
 * digital drill). Every state of every pay table appears at least once.
 * Shaped by `contracts/pay.ts`; parsed in packages/api/src/contracts/pay.test.ts.
 * Amounts are demo placeholders, never Duna's real prices or policy.
 */
import { demoOrganization, demoPeople, demoPlayer } from "../demo";
import { demoId } from "./ids";

const USD = "USD" as const;
const usd = (amountMinor: number) => ({ amountMinor, currency: USD });
const person = (index: number) => {
  const source = index < 0 ? demoPlayer : demoPeople[index]!;
  return {
    personId: source.id,
    displayName: source.displayName,
    initials: source.initials,
  };
};

type AccountStatus =
  | "not-started"
  | "in-progress"
  | "verifying"
  | "action-needed"
  | "restricted"
  | "ready";
type BankStatus = "missing" | "pending" | "verified" | "errored";

const account = (
  status: AccountStatus,
  bank: BankStatus,
  extra: Partial<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    cardPaymentsActive: boolean;
    requirementsDue: { code: string; label: string }[];
    requirementsDueBy: string;
    disabledReason: string;
  }> = {},
) => ({
  organizationId: demoOrganization.id,
  status,
  chargesEnabled: extra.chargesEnabled ?? false,
  payoutsEnabled: extra.payoutsEnabled ?? false,
  cardPaymentsActive: extra.cardPaymentsActive ?? false,
  requirementsDue: extra.requirementsDue ?? [],
  ...(extra.requirementsDueBy
    ? { requirementsDueBy: extra.requirementsDueBy }
    : {}),
  ...(extra.disabledReason ? { disabledReason: extra.disabledReason } : {}),
  bank: {
    status: bank,
    ...(bank === "missing" ? {} : { last4: "6789", name: "[bank name]" }),
  },
  onboardingMethod: "hosted" as const,
  business: {
    legalName: demoOrganization.legalName,
    businessType: "company-llc",
    whatYouSell: "Court rentals, lessons, programs and events",
  },
  firstPayoutDelayWaived: false,
  startTranche: { optIn: false, bps: 0 },
  syncedAt: "2026-11-27T18:00:00.000Z",
});

/** One account per DP-Status state; `accounts["action-needed"]` is the demo club today. */
export const payDemoAccounts = {
  "not-started": account("not-started", "missing"),
  "in-progress": account("in-progress", "missing", {
    requirementsDue: [
      { code: "business_profile.url", label: "Business website" },
    ],
  }),
  verifying: account("verifying", "pending"),
  "action-needed": {
    ...account("action-needed", "errored", {
      chargesEnabled: true,
      cardPaymentsActive: true,
      requirementsDue: [
        {
          code: "representative.dob",
          label: "Representative's date of birth",
        },
        { code: "external_account", label: "Bank account was declined" },
      ],
      requirementsDueBy: "2026-12-04T00:00:00.000Z",
    }),
    firstPayoutNotBefore: "2026-11-24T00:00:00.000Z",
  },
  restricted: account("restricted", "verified", {
    disabledReason: "requirements.past_due",
    requirementsDue: [{ code: "company.tax_id", label: "Business tax ID" }],
  }),
  ready: {
    ...account("ready", "verified", {
      chargesEnabled: true,
      payoutsEnabled: true,
      cardPaymentsActive: true,
    }),
    startTranche: { optIn: true, bps: 2500 },
  },
};

export const payDemoOnboardingSession = {
  state: "hosted" as const,
  url: "https://connect.example/onboarding/demo",
  expiresAt: "2026-11-27T18:30:00.000Z",
};

export const payDemoPayoutSettings = {
  interval: "daily" as const,
  weeklyDay: "monday" as const,
  monthlyDay: 1,
  minimumPayout: usd(10_000),
  statementDescriptor: "SOUTHBAY VB",
  payoutStatementDescriptor: "SOUTHBAY VB PAYOUT",
  syncStatus: "synced" as const,
};

export const payDemoRefundPolicies = [
  {
    id: demoId("pay", 1),
    name: "Lessons",
    mode: "refundable" as const,
    refundBeforeMinutes: 1440,
    terms: "[club policy] Full refund up to 24 hours before the lesson.",
    version: 2,
    isDefault: true,
    active: true,
  },
  {
    id: demoId("pay", 2),
    name: "Court bookings",
    mode: "refundable" as const,
    refundBeforeMinutes: 120,
    terms: "[club policy]",
    version: 1,
    isDefault: false,
    active: true,
  },
  {
    id: demoId("pay", 3),
    name: "Memberships",
    mode: "non-refundable" as const,
    terms: "[club policy]",
    version: 1,
    isDefault: false,
    active: true,
  },
];

export const payDemoTaxSettings = {
  marketplaceTaxEnabled: true,
  registrationStatus: "active" as const,
  taxIdVerified: true,
};

export const payDemoBalance = {
  available: usd(480_000),
  onTheWay: usd(240_000),
  held: usd(96_500),
  reserved: usd(12_000),
  net: usd(816_500),
  nextPayoutAt: "2026-11-30T15:00:00.000Z",
  payoutState: "paused" as const,
};

type DeliveryRule =
  | "scheduled-end"
  | "event-last-day"
  | "pro-rata-sessions"
  | "pro-rata-weekly"
  | "membership-period"
  | "credit-pack-reserve"
  | "goods-fulfilment"
  | "instant";
type ObligationStatus =
  | "pending-settlement"
  | "awaiting-delivery"
  | "partially-released"
  | "released"
  | "held"
  | "disputed"
  | "partially-refunded"
  | "refunded"
  | "cancelled";
type DeliveryEventKind =
  | "booking-ended"
  | "session-ended"
  | "event-last-day-ended"
  | "weekly-portion-elapsed"
  | "membership-payment-received"
  | "refund-window-ended"
  | "credit-redeemed"
  | "credit-refunded"
  | "goods-fulfilled"
  | "goods-shipped"
  | "goods-cancel-offered"
  | "access-granted"
  | "paid-in-person"
  | "delivery-cancelled";
type HoldKind =
  | "dispute"
  | "first-payout-delay"
  | "rolling-reserve"
  | "unredeemed-credit-reserve"
  | "negative-balance"
  | "closure"
  | "manual-review";
type ReserveTrigger =
  | "new-organization-high-volume"
  | "refund-rate"
  | "dispute-rate"
  | "long-dated-sales"
  | "business-change"
  | "processor-requirement"
  | "standing-credit-reserve"
  | "closure";
type DisputeStatus =
  | "needs-response"
  | "evidence-submitted"
  | "under-review"
  | "won"
  | "lost"
  | "accepted"
  | "warning-closed";

// ── Ledger ──────────────────────────────────────────────────────────────────

type TrancheStatus =
  | "scheduled"
  | "delivered"
  | "releasable"
  | "held"
  | "released"
  | "reversed"
  | "cancelled";
type TrancheKind =
  | "full"
  | "session-share"
  | "weekly-portion"
  | "start-tranche"
  | "membership-period"
  | "reserve-remainder";

let trancheSeq = 300;
const tranche = (
  sequence: number,
  kind: TrancheKind,
  status: TrancheStatus,
  amountMinor: number,
  times: Partial<{
    deliveryDueAt: string;
    deliveredAt: string;
    releasableAt: string;
    releasedAt: string;
    sessionId: string;
  }> = {},
) => ({
  id: demoId("pay", trancheSeq++),
  sequence,
  kind,
  status,
  amount: usd(amountMinor),
  ...times,
  ...(status === "released" ? { payoutId: demoId("pay", 290) } : {}),
});

let eventSeq = 400;
const delivered = (
  kind: DeliveryEventKind,
  occurredAt: string,
  sourceType: string,
  details: Record<string, unknown> = {},
  trancheId?: string,
) => ({
  id: demoId("pay", eventSeq++),
  kind,
  occurredAt,
  sourceType,
  details,
  ...(trancheId ? { trancheId } : {}),
});

const zero = usd(0);
const obligation = (
  n: number,
  input: {
    title: string;
    buyer: number;
    productKind: string;
    deliveryRule: DeliveryRule;
    status: ObligationStatus;
    gross: number;
    fee: number;
    tax?: number;
    released?: number;
    refunded?: number;
    disputed?: number;
    reserved?: number;
    settledAt?: string;
    deliveryStartsAt?: string;
    deliveryEndsAt?: string;
    refundWindowEndsAt?: string;
    shipByAt?: string;
    buyerCancelEligibleAt?: string;
    nextReleaseAt?: string;
  },
) => {
  const tax = input.tax ?? 0;
  return {
    id: demoId("pay", 100 + n),
    orderId: demoId("pay", 200 + n),
    title: input.title,
    buyer: person(input.buyer),
    productKind: input.productKind,
    deliveryRule: input.deliveryRule,
    status: input.status,
    gross: usd(input.gross),
    applicationFee: usd(input.fee),
    tax: usd(tax),
    proceeds: usd(input.gross - input.fee - tax),
    released: input.released ? usd(input.released) : zero,
    refunded: input.refunded ? usd(input.refunded) : zero,
    disputed: input.disputed ? usd(input.disputed) : zero,
    reserved: input.reserved ? usd(input.reserved) : zero,
    ...(input.settledAt ? { settledAt: input.settledAt } : {}),
    ...(input.deliveryStartsAt
      ? { deliveryStartsAt: input.deliveryStartsAt }
      : {}),
    ...(input.deliveryEndsAt ? { deliveryEndsAt: input.deliveryEndsAt } : {}),
    ...(input.refundWindowEndsAt
      ? { refundWindowEndsAt: input.refundWindowEndsAt }
      : {}),
    ...(input.shipByAt ? { shipByAt: input.shipByAt } : {}),
    ...(input.buyerCancelEligibleAt
      ? { buyerCancelEligibleAt: input.buyerCancelEligibleAt }
      : {}),
    ...(input.nextReleaseAt ? { nextReleaseAt: input.nextReleaseAt } : {}),
  };
};

const courtRental = obligation(1, {
  title: "Court 2 · 90 min",
  buyer: -1,
  productKind: "service/court-rental",
  deliveryRule: "scheduled-end",
  status: "released",
  gross: 6_000,
  fee: 450,
  released: 5_550,
  settledAt: "2026-11-20T18:00:00.000Z",
  deliveryStartsAt: "2026-11-22T16:00:00.000Z",
  deliveryEndsAt: "2026-11-22T17:30:00.000Z",
});
const courtRentalTranche = tranche(0, "full", "released", 5_550, {
  deliveryDueAt: "2026-11-22T17:30:00.000Z",
  deliveredAt: "2026-11-22T17:30:00.000Z",
  releasableAt: "2026-11-22T17:30:00.000Z",
  releasedAt: "2026-11-24T15:00:00.000Z",
});

const tournament = obligation(2, {
  title: "Winter Open · Women's AA",
  buyer: 0,
  productKind: "event/tournament",
  deliveryRule: "event-last-day",
  status: "awaiting-delivery",
  gross: 12_000,
  fee: 780,
  settledAt: "2026-11-25T18:00:00.000Z",
  deliveryStartsAt: "2026-12-12T15:00:00.000Z",
  deliveryEndsAt: "2026-12-13T23:00:00.000Z",
  nextReleaseAt: "2026-12-13T23:00:00.000Z",
});
const tournamentTranche = tranche(0, "full", "scheduled", 11_220, {
  deliveryDueAt: "2026-12-13T23:00:00.000Z",
});

const programSessions = [
  demoId("pay", 500),
  demoId("pay", 501),
  demoId("pay", 502),
  demoId("pay", 503),
];
const program = obligation(3, {
  title: "Junior program · 8 weeks",
  buyer: 1,
  productKind: "service/program",
  deliveryRule: "pro-rata-sessions",
  status: "partially-released",
  gross: 24_000,
  fee: 1_200,
  released: 9_120,
  settledAt: "2026-11-01T18:00:00.000Z",
  deliveryStartsAt: "2026-11-08T16:00:00.000Z",
  deliveryEndsAt: "2026-12-27T18:00:00.000Z",
  nextReleaseAt: "2026-11-29T18:00:00.000Z",
});
const programTranches = [
  tranche(0, "start-tranche", "released", 5_700, {
    deliveryDueAt: "2026-11-08T18:00:00.000Z",
    deliveredAt: "2026-11-08T18:00:00.000Z",
    releasableAt: "2026-11-08T18:00:00.000Z",
    releasedAt: "2026-11-11T15:00:00.000Z",
  }),
  tranche(1, "session-share", "released", 3_420, {
    sessionId: programSessions[0],
    deliveryDueAt: "2026-11-15T18:00:00.000Z",
    deliveredAt: "2026-11-15T18:00:00.000Z",
    releasableAt: "2026-11-15T18:00:00.000Z",
    releasedAt: "2026-11-18T15:00:00.000Z",
  }),
  tranche(2, "session-share", "releasable", 3_420, {
    sessionId: programSessions[1],
    deliveryDueAt: "2026-11-22T18:00:00.000Z",
    deliveredAt: "2026-11-22T18:00:00.000Z",
    releasableAt: "2026-11-22T18:00:00.000Z",
  }),
  tranche(3, "session-share", "delivered", 3_420, {
    sessionId: programSessions[2],
    deliveryDueAt: "2026-11-27T18:00:00.000Z",
    deliveredAt: "2026-11-27T18:00:00.000Z",
    releasableAt: "2026-11-29T18:00:00.000Z",
  }),
  tranche(4, "session-share", "scheduled", 6_840, {
    sessionId: programSessions[3],
    deliveryDueAt: "2026-12-27T18:00:00.000Z",
  }),
];

const league = obligation(4, {
  title: "Thursday league · team entry",
  buyer: 2,
  productKind: "event/league",
  deliveryRule: "pro-rata-weekly",
  status: "pending-settlement",
  gross: 40_000,
  fee: 2_000,
  deliveryStartsAt: "2026-12-04T02:00:00.000Z",
  deliveryEndsAt: "2027-01-22T04:00:00.000Z",
});
const leagueTranche = tranche(0, "weekly-portion", "scheduled", 4_750, {
  deliveryDueAt: "2026-12-11T04:00:00.000Z",
});

const membership = obligation(5, {
  title: "Club membership · December",
  buyer: 3,
  productKind: "plan/membership",
  deliveryRule: "membership-period",
  status: "held",
  gross: 12_900,
  fee: 520,
  settledAt: "2026-11-27T18:00:00.000Z",
  refundWindowEndsAt: "2026-12-27T18:00:00.000Z",
  nextReleaseAt: "2026-12-27T18:00:00.000Z",
});
const membershipTranche = tranche(0, "membership-period", "held", 12_380, {
  deliveredAt: "2026-11-27T18:00:00.000Z",
  releasableAt: "2026-12-27T18:00:00.000Z",
});

const creditPack = obligation(6, {
  title: "10-session pack",
  buyer: -1,
  productKind: "plan/credit-pack",
  deliveryRule: "credit-pack-reserve",
  status: "partially-refunded",
  gross: 30_000,
  fee: 1_500,
  released: 19_380,
  refunded: 3_000,
  reserved: 2_280,
  settledAt: "2026-10-15T18:00:00.000Z",
});
const creditPackTranches = [
  tranche(0, "full", "released", 19_380, {
    deliveredAt: "2026-10-15T18:00:00.000Z",
    releasableAt: "2026-10-20T18:00:00.000Z",
    releasedAt: "2026-10-21T15:00:00.000Z",
  }),
  tranche(1, "reserve-remainder", "held", 2_280, {
    releasableAt: "2027-04-15T18:00:00.000Z",
  }),
];

const goods = obligation(7, {
  title: "Club shirt · M",
  buyer: 0,
  productKind: "good/apparel",
  deliveryRule: "goods-fulfilment",
  status: "disputed",
  gross: 3_500,
  fee: 250,
  tax: 300,
  disputed: 3_500,
  settledAt: "2026-11-05T18:00:00.000Z",
  shipByAt: "2026-11-19T18:00:00.000Z",
  buyerCancelEligibleAt: "2026-12-05T18:00:00.000Z",
});
const goodsTranche = tranche(0, "full", "held", 2_950, {
  deliveredAt: "2026-11-12T18:00:00.000Z",
  releasableAt: "2026-11-15T18:00:00.000Z",
});

const drill = obligation(8, {
  title: "Drill · Serve-receive ladder",
  buyer: 1,
  productKind: "good/digital-content",
  deliveryRule: "instant",
  status: "refunded",
  gross: 800,
  fee: 100,
  refunded: 800,
  settledAt: "2026-11-10T18:00:00.000Z",
});
const drillTranche = tranche(0, "full", "reversed", 700, {
  deliveredAt: "2026-11-10T18:00:00.000Z",
  releasableAt: "2026-11-13T18:00:00.000Z",
});

const cancelledLesson = obligation(9, {
  title: "Private lesson · 60 min",
  buyer: 2,
  productKind: "service/private-lesson",
  deliveryRule: "scheduled-end",
  status: "cancelled",
  gross: 15_000,
  fee: 900,
  refunded: 15_000,
  settledAt: "2026-11-18T18:00:00.000Z",
  deliveryStartsAt: "2026-11-26T17:00:00.000Z",
  deliveryEndsAt: "2026-11-26T18:00:00.000Z",
});
const cancelledLessonTranche = tranche(0, "full", "cancelled", 14_100, {
  deliveryDueAt: "2026-11-26T18:00:00.000Z",
});

const fallClassic = obligation(10, {
  title: "Fall Classic · Men's Open",
  buyer: 3,
  productKind: "event/tournament",
  deliveryRule: "event-last-day",
  status: "released",
  gross: 9_000,
  fee: 600,
  released: 8_400,
  settledAt: "2026-10-01T18:00:00.000Z",
  deliveryStartsAt: "2026-10-10T15:00:00.000Z",
  deliveryEndsAt: "2026-10-11T23:00:00.000Z",
});
const fallClassicTranche = tranche(0, "full", "released", 8_400, {
  deliveryDueAt: "2026-10-11T23:00:00.000Z",
  deliveredAt: "2026-10-11T23:00:00.000Z",
  releasableAt: "2026-10-11T23:00:00.000Z",
  releasedAt: "2026-10-14T15:00:00.000Z",
});

const refund = (
  n: number,
  source: "held-funds" | "available-balance" | "future-proceeds" | "bank-debit",
  amountMinor: number,
  serviceFeeKeptMinor = 0,
) => ({
  id: demoId("pay", 600 + n),
  refundRecordId: demoId("pay", 650 + n),
  source,
  amount: usd(amountMinor),
  serviceFeeKept: usd(serviceFeeKeptMinor),
  createdAt: "2026-11-25T18:00:00.000Z",
});

export const payDemoHoldIds = {
  dispute: demoId("pay", 700),
  firstPayout: demoId("pay", 701),
  rolling: demoId("pay", 702),
  credit: demoId("pay", 703),
  negative: demoId("pay", 704),
  closure: demoId("pay", 705),
  manual: demoId("pay", 706),
} as const;

export const payDemoObligations = [
  {
    ...courtRental,
    tranches: [courtRentalTranche],
    deliveryEvents: [
      delivered(
        "booking-ended",
        "2026-11-22T17:30:00.000Z",
        "court_booking",
        {},
        courtRentalTranche.id,
      ),
    ],
    refunds: [],
    holdIds: [],
  },
  {
    ...tournament,
    tranches: [tournamentTranche],
    deliveryEvents: [],
    refunds: [],
    holdIds: [],
  },
  {
    ...program,
    tranches: programTranches,
    deliveryEvents: [
      delivered(
        "session-ended",
        "2026-11-08T18:00:00.000Z",
        "session",
        {},
        programTranches[0]!.id,
      ),
      delivered(
        "session-ended",
        "2026-11-15T18:00:00.000Z",
        "session",
        {},
        programTranches[1]!.id,
      ),
      delivered(
        "session-ended",
        "2026-11-22T18:00:00.000Z",
        "session",
        {},
        programTranches[2]!.id,
      ),
      delivered(
        "session-ended",
        "2026-11-27T18:00:00.000Z",
        "session",
        {},
        programTranches[3]!.id,
      ),
    ],
    refunds: [],
    holdIds: [],
  },
  {
    ...league,
    tranches: [leagueTranche],
    deliveryEvents: [
      delivered("weekly-portion-elapsed", "2026-11-27T04:00:00.000Z", "cron", {
        note: "Previous season portion",
      }),
    ],
    refunds: [],
    holdIds: [],
  },
  {
    ...membership,
    tranches: [membershipTranche],
    deliveryEvents: [
      delivered(
        "membership-payment-received",
        "2026-11-27T18:00:00.000Z",
        "payment",
        {},
        membershipTranche.id,
      ),
      delivered("refund-window-ended", "2026-11-27T18:00:00.000Z", "cron", {
        previousPeriod: "2026-11",
      }),
    ],
    refunds: [],
    holdIds: [payDemoHoldIds.firstPayout],
  },
  {
    ...creditPack,
    tranches: creditPackTranches,
    deliveryEvents: [
      delivered("paid-in-person", "2026-10-15T18:00:00.000Z", "terminal", {}),
      delivered(
        "credit-redeemed",
        "2026-11-01T18:00:00.000Z",
        "catalog_fulfillment",
        { credits: 2 },
      ),
      delivered("credit-refunded", "2026-11-20T18:00:00.000Z", "refund", {
        credits: 1,
      }),
    ],
    refunds: [
      refund(1, "held-funds", 1_000),
      refund(2, "available-balance", 1_000),
      refund(3, "future-proceeds", 1_000),
    ],
    holdIds: [payDemoHoldIds.credit],
  },
  {
    ...goods,
    tranches: [goodsTranche],
    deliveryEvents: [
      delivered(
        "goods-shipped",
        "2026-11-12T18:00:00.000Z",
        "catalog_fulfillment",
        { carrier: "[carrier]", trackingNumber: "TRACK-DEMO-0001" },
        goodsTranche.id,
      ),
      delivered(
        "goods-fulfilled",
        "2026-11-14T18:00:00.000Z",
        "catalog_fulfillment",
        {},
      ),
      delivered("goods-cancel-offered", "2026-11-20T18:00:00.000Z", "cron", {
        reason: "past ship-by date",
      }),
    ],
    refunds: [],
    holdIds: [payDemoHoldIds.dispute],
  },
  {
    ...drill,
    tranches: [drillTranche],
    deliveryEvents: [
      delivered(
        "access-granted",
        "2026-11-10T18:00:00.000Z",
        "training_drill_purchase",
        {},
        drillTranche.id,
      ),
    ],
    refunds: [refund(4, "bank-debit", 800)],
    holdIds: [],
  },
  {
    ...cancelledLesson,
    tranches: [cancelledLessonTranche],
    deliveryEvents: [
      delivered("delivery-cancelled", "2026-11-25T18:00:00.000Z", "person", {
        reason: "Coach unavailable",
      }),
      delivered("booking-ended", "2026-11-26T18:00:00.000Z", "court_booking", {
        note: "No-op after cancellation",
      }),
    ],
    refunds: [refund(5, "held-funds", 15_000)],
    holdIds: [],
  },
  {
    ...fallClassic,
    tranches: [fallClassicTranche],
    deliveryEvents: [
      delivered(
        "event-last-day-ended",
        "2026-10-11T23:00:00.000Z",
        "session",
        {},
        fallClassicTranche.id,
      ),
    ],
    refunds: [],
    holdIds: [],
  },
];

const disputeIds = {
  needsResponse: demoId("pay", 800),
  submitted: demoId("pay", 801),
  review: demoId("pay", 802),
  won: demoId("pay", 803),
  lost: demoId("pay", 804),
  accepted: demoId("pay", 805),
  warning: demoId("pay", 806),
} as const;

const hold = (
  id: string,
  kind: HoldKind,
  status: "active" | "released" | "applied",
  amountMinor: number,
  reason: string,
  extra: Partial<{
    obligationId: string;
    reserveId: string;
    disputeCaseId: string;
    releaseAfter: string;
  }> = {},
) => ({
  id,
  kind,
  status,
  amount: usd(amountMinor),
  reason,
  ...extra,
  startsAt: "2026-11-20T18:00:00.000Z",
  ...(status === "active" ? {} : { releasedAt: "2026-11-26T18:00:00.000Z" }),
});

const reserveIds = Array.from({ length: 8 }, (_, i) => demoId("pay", 750 + i));

export const payDemoHolds = [
  hold(
    payDemoHoldIds.dispute,
    "dispute",
    "active",
    4_000,
    "Card dispute on Club shirt",
    {
      obligationId: goods.id,
      disputeCaseId: disputeIds.needsResponse,
    },
  ),
  hold(
    payDemoHoldIds.firstPayout,
    "first-payout-delay",
    "active",
    12_380,
    "First payout no earlier than 7 days after the first charge",
    {
      obligationId: membership.id,
      releaseAfter: "2026-12-04T18:00:00.000Z",
    },
  ),
  hold(
    payDemoHoldIds.rolling,
    "rolling-reserve",
    "released",
    9_000,
    "Rolling reserve 10% for 90 days",
    {
      reserveId: reserveIds[1]!,
    },
  ),
  hold(
    payDemoHoldIds.credit,
    "unredeemed-credit-reserve",
    "active",
    2_280,
    "Unredeemed credit reserve",
    {
      obligationId: creditPack.id,
      reserveId: reserveIds[6]!,
    },
  ),
  hold(
    payDemoHoldIds.negative,
    "negative-balance",
    "applied",
    1_500,
    "Set off against a refund after payout",
  ),
  hold(
    payDemoHoldIds.closure,
    "closure",
    "released",
    0,
    "Closure review finished",
  ),
  hold(
    payDemoHoldIds.manual,
    "manual-review",
    "active",
    50_000,
    "Review of a large first sale",
  ),
];

const reserve = (
  index: number,
  kind: "rolling" | "unredeemed-credit" | "closure",
  trigger: ReserveTrigger,
  status: "proposed" | "active" | "under-review" | "released",
  percentBps: number,
  heldMinor: number,
) => {
  const live = status === "active" || status === "under-review";
  return {
    id: reserveIds[index]!,
    kind,
    trigger,
    status,
    percentBps,
    ...(status === "proposed"
      ? {}
      : {
          startsAt: "2026-10-01T00:00:00.000Z",
          ...(kind === "unredeemed-credit"
            ? {}
            : { endsAt: "2026-12-30T00:00:00.000Z" }),
          reviewAt: "2026-12-01T00:00:00.000Z",
          noticeSentAt: "2026-10-01T00:00:00.000Z",
        }),
    noticeReason: `[reason for ${trigger}]`,
    held: usd(live ? heldMinor : 0),
  };
};

export const payDemoReserves = [
  reserve(0, "rolling", "new-organization-high-volume", "proposed", 1_000, 0),
  reserve(1, "rolling", "refund-rate", "released", 1_000, 9_000),
  reserve(2, "rolling", "dispute-rate", "under-review", 1_000, 4_500),
  reserve(3, "rolling", "long-dated-sales", "active", 1_000, 3_000),
  reserve(4, "rolling", "business-change", "proposed", 500, 0),
  reserve(5, "rolling", "processor-requirement", "active", 1_000, 2_500),
  reserve(
    6,
    "unredeemed-credit",
    "standing-credit-reserve",
    "active",
    2_000,
    2_280,
  ),
  reserve(7, "closure", "closure", "proposed", 10_000, 0),
];

const dispute = (
  id: string,
  status: DisputeStatus,
  amountMinor: number,
  extra: Partial<{
    feeReturned: boolean;
    evidenceSubmittedAt: string;
    closedAt: string;
  }> = {},
) => ({
  id,
  obligationId: goods.id,
  orderId: goods.orderId,
  buyer: person(0),
  reason: "product_not_received",
  status,
  amount: usd(amountMinor),
  fee: usd(1_500),
  feeReturned: extra.feeReturned ?? false,
  evidenceDueBy: "2026-12-10T00:00:00.000Z",
  organizationEvidenceDueBy: "2026-12-03T00:00:00.000Z",
  ...(extra.evidenceSubmittedAt
    ? { evidenceSubmittedAt: extra.evidenceSubmittedAt }
    : {}),
  openedAt: "2026-11-26T00:00:00.000Z",
  ...(extra.closedAt ? { closedAt: extra.closedAt } : {}),
  evidence: {
    ...(extra.evidenceSubmittedAt
      ? { explanation: "[club's explanation]" }
      : {}),
    files: extra.evidenceSubmittedAt
      ? [{ storageKey: "demo/dispute/tracking.pdf", label: "Tracking record" }]
      : [],
  },
  ...(status === "needs-response" ? { holdId: payDemoHoldIds.dispute } : {}),
});

export const payDemoDisputes = [
  dispute(disputeIds.needsResponse, "needs-response", 3_500),
  dispute(disputeIds.submitted, "evidence-submitted", 12_900, {
    evidenceSubmittedAt: "2026-11-27T00:00:00.000Z",
  }),
  dispute(disputeIds.review, "under-review", 6_000, {
    evidenceSubmittedAt: "2026-11-20T00:00:00.000Z",
  }),
  dispute(disputeIds.won, "won", 15_000, {
    evidenceSubmittedAt: "2026-10-20T00:00:00.000Z",
    feeReturned: true,
    closedAt: "2026-11-10T00:00:00.000Z",
  }),
  dispute(disputeIds.lost, "lost", 4_000, {
    evidenceSubmittedAt: "2026-10-10T00:00:00.000Z",
    closedAt: "2026-11-05T00:00:00.000Z",
  }),
  dispute(disputeIds.accepted, "accepted", 2_000, {
    closedAt: "2026-11-01T00:00:00.000Z",
  }),
  dispute(disputeIds.warning, "warning-closed", 1_000, {
    closedAt: "2026-10-28T00:00:00.000Z",
  }),
];

export const payDemoRecoveries = [
  {
    id: demoId("pay", 900),
    kind: "set-off" as const,
    status: "collected" as const,
    amount: usd(1_500),
    owedFor: "negative-balance",
    collectedAt: "2026-11-24T15:00:00.000Z",
  },
  {
    id: demoId("pay", 901),
    kind: "bank-debit" as const,
    status: "failed" as const,
    amount: usd(2_400),
    owedFor: "negative-balance",
  },
  {
    id: demoId("pay", 902),
    kind: "invoice" as const,
    status: "pending" as const,
    amount: usd(2_400),
    owedFor: "negative-balance",
    dueAt: "2026-12-12T00:00:00.000Z",
    invoiceReference: "DEMO-INV-0001",
  },
  {
    id: demoId("pay", 903),
    kind: "invoice" as const,
    status: "written-off" as const,
    amount: usd(300),
    owedFor: "video-overage",
    dueAt: "2026-09-01T00:00:00.000Z",
    invoiceReference: "DEMO-INV-0000",
  },
];

export const payDemoPublishGate = {
  ready: false,
  steps: [
    {
      key: "business" as const,
      label: "Confirm your business",
      state: "done" as const,
      href: "/money/duna-pay",
    },
    {
      key: "verify" as const,
      label: "Verify with Stripe",
      state: "to-do" as const,
      href: "/money/duna-pay",
    },
    {
      key: "payouts" as const,
      label: "Choose payouts",
      state: "to-do" as const,
      href: "/money/payouts",
    },
  ],
  resumeHref: "/offerings",
};

export const payDemoMoneyHome = {
  accountStatus: "action-needed" as const,
  balance: payDemoBalance,
  thisMonth: {
    gross: usd(1_592_000),
    dunaFees: usd(39_800),
    dunaFeeBps: 250,
    changeBps: 1_200,
  },
  openDisputes: 1,
  activeHolds: 3,
  recentTransactions: payDemoObligations.slice(0, 5).map((item) => ({
    id: item.orderId,
    occurredAt: item.settledAt ?? "2026-11-27T18:00:00.000Z",
    what: item.title,
    who: item.buyer,
    amount: item.gross,
    net: item.proceeds,
  })),
};

export const payDemo = {
  domain: "pay",
  account: payDemoAccounts["action-needed"],
  accounts: payDemoAccounts,
  onboardingSession: payDemoOnboardingSession,
  payoutSettings: payDemoPayoutSettings,
  refundPolicies: payDemoRefundPolicies,
  taxSettings: payDemoTaxSettings,
  balance: payDemoBalance,
  obligations: payDemoObligations,
  holds: payDemoHolds,
  reserves: payDemoReserves,
  disputes: payDemoDisputes,
  recoveries: payDemoRecoveries,
  publishGate: payDemoPublishGate,
  moneyHome: payDemoMoneyHome,
} as const;
