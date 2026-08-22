import {
  appliedFees,
  courtBookings,
  disputes,
  eventBlueprints,
  getDatabase,
  getTransactionalDatabase,
  ledgerEntries,
  ledgerJournals,
  orderItems,
  orders,
  organizationMoneySettings,
  organizationRefundPolicies,
  organizations,
  payoutAllocations,
  paymentFundSchedules,
  payments,
  payouts,
  people,
  registrations,
  sessions,
  stripeTransactionLinks,
  ticketTypes,
  tickets,
} from "@duna/db";
import { assertBalancedJournal, type LedgerPosting } from "@duna/core";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { OrganizationMoneyWorkspace } from "./contracts";
import type { ApiActor } from "./context";
import { ensureLedgerAccount } from "./catalog-service";
import {
  configureConnectedAccountMoney,
  createConnectedAccountPayout,
  loadConnectedAccountMoney,
  retrieveStripePaymentLineage,
  type StripePaymentLineage,
} from "./payments";
import { postCatalogPaymentCapture } from "./catalog-checkout";

type Currency = OrganizationMoneyWorkspace["currency"];
type PayoutInterval = OrganizationMoneyWorkspace["settings"]["payoutInterval"];
type Weekday = OrganizationMoneyWorkspace["settings"]["weeklyPayoutDay"];

const DEFAULT_REFUND_MINUTES = 24 * 60;

export function projectOrganizationBalance(input: {
  readonly ledgerAvailableMinor: number;
  readonly ledgerHeldMinor: number;
  readonly ledgerPendingMinor: number;
  readonly processorAvailableMinor?: number;
  readonly processorPendingMinor?: number;
}): {
  readonly totalMinor: number;
  readonly availableMinor: number;
  readonly heldMinor: number;
  readonly pendingMinor: number;
} {
  if (
    input.processorAvailableMinor === undefined ||
    input.processorPendingMinor === undefined
  ) {
    return {
      totalMinor:
        input.ledgerAvailableMinor +
        input.ledgerHeldMinor +
        input.ledgerPendingMinor,
      availableMinor: input.ledgerAvailableMinor,
      heldMinor: input.ledgerHeldMinor,
      pendingMinor: input.ledgerPendingMinor,
    };
  }
  const processorOutstandingMinor =
    input.processorAvailableMinor + input.processorPendingMinor;
  const heldMinor = Math.min(input.ledgerHeldMinor, processorOutstandingMinor);
  const afterHeldMinor = processorOutstandingMinor - heldMinor;
  const pendingMinor = Math.min(input.ledgerPendingMinor, afterHeldMinor);
  const afterProtectedMinor = afterHeldMinor - pendingMinor;
  const availableMinor = Math.min(
    input.ledgerAvailableMinor,
    Math.max(0, input.processorAvailableMinor - heldMinor),
    afterProtectedMinor,
  );
  return {
    totalMinor: availableMinor + heldMinor + pendingMinor,
    availableMinor,
    heldMinor,
    pendingMinor,
  };
}

export function loadDemoOrganizationMoneyWorkspace(
  now = new Date(),
): OrganizationMoneyWorkspace {
  const day = (offset: number) =>
    new Date(now.getTime() + offset * 24 * 60 * 60_000).toISOString();
  const transactions: OrganizationMoneyWorkspace["transactions"] = [
    {
      id: "demo-fund-1",
      orderId: "91000000-0000-4000-8000-000000000001",
      description: "Sunset doubles training",
      customerName: "Maya Chen",
      grossMinor: 9_675,
      consumerFeeMinor: 675,
      processingFeeMinor: 305,
      organizationFeeMinor: 0,
      taxMinor: 0,
      netMinor: 8_695,
      refundedMinor: 0,
      currency: "USD",
      status: "held",
      policyName: "Flexible · 24 hours",
      availableAt: day(1),
      occurredAt: day(-2),
      reconciled: true,
    },
    {
      id: "demo-fund-2",
      orderId: "91000000-0000-4000-8000-000000000002",
      description: "Performance membership",
      customerName: "Jordan Smith",
      grossMinor: 18_500,
      consumerFeeMinor: 0,
      processingFeeMinor: 590,
      organizationFeeMinor: 0,
      taxMinor: 0,
      netMinor: 17_910,
      refundedMinor: 0,
      currency: "USD",
      status: "available",
      policyName: "Non-refundable",
      availableAt: day(-1),
      occurredAt: day(-4),
      reconciled: true,
    },
    {
      id: "demo-fund-3",
      orderId: "91000000-0000-4000-8000-000000000003",
      description: "Summer beach camp",
      customerName: "Ava Rodriguez",
      grossMinor: 32_250,
      consumerFeeMinor: 2_250,
      processingFeeMinor: 935,
      organizationFeeMinor: 0,
      taxMinor: 0,
      netMinor: 29_065,
      refundedMinor: 0,
      currency: "USD",
      status: "pending-clearance",
      policyName: "Flexible · 7 days",
      availableAt: day(8),
      occurredAt: day(-1),
      reconciled: true,
    },
  ];
  return {
    generatedAt: now.toISOString(),
    currency: "USD",
    balance: {
      totalMinor: transactions.reduce((sum, row) => sum + row.netMinor, 0),
      availableMinor: 17_910,
      heldMinor: 8_695,
      pendingMinor: 29_065,
      inTransitMinor: 24_800,
      nextReleaseAt: day(1),
      nextReleaseMinor: 8_695,
    },
    earnings: {
      grossMinor: 60_425,
      netMinor: 55_670,
      feesMinor: 4_755,
      refundsMinor: 0,
      points: Array.from({ length: 30 }, (_, index) => ({
        date: day(index - 29).slice(0, 10),
        grossMinor:
          index % 5 === 0 ? 9_675 + index * 110 : index % 3 === 0 ? 4_500 : 0,
        netMinor:
          index % 5 === 0 ? 8_695 + index * 100 : index % 3 === 0 ? 4_200 : 0,
      })),
    },
    connect: {
      accountId: "acct_demo",
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      bankStatus: "connected",
      bankName: "First Sand Bank",
      bankLast4: "1842",
      stripeAvailableMinor: 26_605,
      stripePendingMinor: 29_065,
      stripeInstantAvailableMinor: 17_910,
      stripeReservedMinor: 0,
      stripePayoutInterval: "manual",
      earnings30d: {
        grossMinor: 60_425,
        netMinor: 55_670,
        feesMinor: 4_755,
        payoutsMinor: 24_800,
        points: Array.from({ length: 30 }, (_, index) => ({
          date: day(index - 29).slice(0, 10),
          grossMinor:
            index % 5 === 0 ? 9_675 + index * 110 : index % 3 === 0 ? 4_500 : 0,
          netMinor:
            index % 5 === 0 ? 8_695 + index * 100 : index % 3 === 0 ? 4_200 : 0,
        })),
      },
      bankAccounts: [
        {
          id: "ba_demo",
          type: "bank-account",
          name: "First Sand Bank",
          last4: "1842",
          currency: "USD",
          status: "connected",
          defaultForCurrency: true,
        },
      ],
      activity: [
        {
          id: "txn_demo_transfer",
          type: "transfer",
          reportingCategory: "transfer",
          description: "Duna order settlement",
          amountMinor: 17_910,
          feeMinor: 0,
          netMinor: 17_910,
          status: "available",
          availableAt: day(-1),
          occurredAt: day(-4),
        },
        {
          id: "txn_demo_payout",
          type: "payout",
          reportingCategory: "payout",
          description: "Payout to First Sand Bank •••• 1842",
          amountMinor: -24_800,
          feeMinor: 0,
          netMinor: -24_800,
          status: "available",
          availableAt: day(-1),
          occurredAt: day(-1),
        },
      ],
      disputes: [],
      requirementsDue: [],
      liveData: false,
    },
    settings: {
      payoutInterval: "weekly",
      weeklyPayoutDay: "friday",
      monthlyPayoutDay: 1,
      minimumPayoutMinor: 5_000,
      statementDescriptor: "BEACH ELITE",
      payoutStatementDescriptor: "DUNA BEACH ELITE",
      stripeSettingsStatus: "synced",
      stripeSettingsSyncedAt: day(-1),
      lastAutomaticPayoutAt: day(-5),
    },
    refundPolicies: [
      {
        id: "92000000-0000-4000-8000-000000000001",
        name: "Flexible · 24 hours",
        mode: "refundable",
        refundBeforeMinutes: 1_440,
        terms: "Cancel at least 24 hours before start for an automatic refund.",
        version: 1,
        isDefault: true,
        active: true,
      },
      {
        id: "92000000-0000-4000-8000-000000000002",
        name: "Non-refundable",
        mode: "non-refundable",
        terms:
          "This purchase is final and becomes available after payment clears.",
        version: 1,
        isDefault: false,
        active: true,
      },
    ],
    transactions,
    payouts: [
      {
        id: "93000000-0000-4000-8000-000000000001",
        stripePayoutId: "po_demo",
        amountMinor: 24_800,
        currency: "USD",
        status: "in_transit",
        expectedArrivalAt: day(1),
        createdAt: day(-1),
      },
    ],
    disputes: [],
  };
}

function currency(value: string): Currency {
  if (["USD", "CAD", "AUD", "BRL", "EUR"].includes(value)) {
    return value as Currency;
  }
  return "USD";
}

export function calculateFundAvailability(input: {
  readonly policyMode: "refundable" | "non-refundable";
  readonly refundBeforeMinutes?: number;
  readonly eventStartsAt?: Date;
  readonly orderCreatedAt: Date;
  readonly processorAvailableAt: Date;
  readonly now: Date;
}): {
  readonly policyReleaseAt: Date;
  readonly availableAt: Date;
  readonly status: "pending-clearance" | "held" | "available";
} {
  const policyReleaseAt =
    input.policyMode === "non-refundable"
      ? input.orderCreatedAt
      : input.eventStartsAt
        ? new Date(
            input.eventStartsAt.getTime() -
              (input.refundBeforeMinutes ?? 0) * 60_000,
          )
        : new Date(
            input.orderCreatedAt.getTime() +
              (input.refundBeforeMinutes ?? DEFAULT_REFUND_MINUTES) * 60_000,
          );
  const availableAt = new Date(
    Math.max(input.processorAvailableAt.getTime(), policyReleaseAt.getTime()),
  );
  return {
    policyReleaseAt,
    availableAt,
    status:
      availableAt <= input.now
        ? "available"
        : input.processorAvailableAt > input.now
          ? "pending-clearance"
          : "held",
  };
}

function descriptor(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 .,&+-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 22);
  if (!normalized) return undefined;
  if (normalized.length < 5 || !/[A-Z]/.test(normalized)) {
    throw new Error(
      "Statement descriptors need 5–22 characters and at least one letter.",
    );
  }
  return normalized;
}

function status(
  value: string,
): OrganizationMoneyWorkspace["transactions"][number]["status"] {
  const allowed = new Set([
    "pending-clearance",
    "held",
    "available",
    "payout-pending",
    "paid-out",
    "partially-refunded",
    "refunded",
    "disputed",
  ]);
  return allowed.has(value)
    ? (value as OrganizationMoneyWorkspace["transactions"][number]["status"])
    : "pending-clearance";
}

async function ensureMoneyDefaults(organizationId: string): Promise<void> {
  const database = getDatabase();
  await database.batch([
    database
      .insert(organizationMoneySettings)
      .values({ organizationId })
      .onConflictDoNothing(),
    database
      .insert(organizationRefundPolicies)
      .values({
        organizationId,
        name: "Flexible · 24 hours",
        mode: "refundable",
        refundBeforeMinutes: DEFAULT_REFUND_MINUTES,
        terms:
          "Cancel at least 24 hours before the event begins for an automatic refund to the original payment method.",
        isDefault: true,
      })
      .onConflictDoNothing(),
  ]);
}

async function resolveOrderPolicy(orderId: string) {
  const database = getDatabase();
  const registrationEvent = await database
    .select({
      sessionId: sessions.id,
      startsAt: sessions.startsAt,
      registrationSettings: eventBlueprints.registrationSettings,
    })
    .from(registrations)
    .innerJoin(sessions, eq(registrations.sessionId, sessions.id))
    .leftJoin(eventBlueprints, eq(eventBlueprints.sessionId, sessions.id))
    .where(eq(registrations.orderId, orderId))
    .limit(1)
    .then((rows) => rows[0]);
  const ticketEvent = registrationEvent
    ? undefined
    : await database
        .select({
          sessionId: sessions.id,
          startsAt: sessions.startsAt,
          registrationSettings: eventBlueprints.registrationSettings,
        })
        .from(tickets)
        .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
        .innerJoin(sessions, eq(ticketTypes.sessionId, sessions.id))
        .leftJoin(eventBlueprints, eq(eventBlueprints.sessionId, sessions.id))
        .where(eq(tickets.orderId, orderId))
        .limit(1)
        .then((rows) => rows[0]);
  const court =
    registrationEvent || ticketEvent
      ? undefined
      : await database.query.courtBookings.findFirst({
          where: eq(courtBookings.orderId, orderId),
        });
  const event = registrationEvent ?? ticketEvent;
  if (event) {
    const settings = event.registrationSettings as
      { readonly smartRules?: Readonly<Record<string, unknown>> } | undefined;
    const rules = settings?.smartRules;
    const mode =
      rules?.refundPolicyMode === "non-refundable"
        ? ("non-refundable" as const)
        : ("refundable" as const);
    const hours =
      typeof rules?.freeCancellationHours === "number" &&
      Number.isFinite(rules.freeCancellationHours)
        ? Math.max(0, Math.round(rules.freeCancellationHours))
        : 24;
    return {
      sessionId: event.sessionId,
      startsAt: event.startsAt,
      mode,
      refundBeforeMinutes: mode === "refundable" ? hours * 60 : undefined,
      name:
        mode === "non-refundable"
          ? "Non-refundable"
          : `Flexible · ${hours} hour${hours === 1 ? "" : "s"}`,
      version: 1,
    };
  }
  if (court) {
    const snapshot = court.policySnapshot;
    const hours = snapshot.refundBeforeHours;
    const mode =
      hours === undefined
        ? ("non-refundable" as const)
        : ("refundable" as const);
    return {
      sessionId: undefined,
      startsAt: court.startsAt,
      mode,
      refundBeforeMinutes: hours === undefined ? undefined : hours * 60,
      name:
        mode === "non-refundable"
          ? "Non-refundable"
          : `Reservation · ${hours} hour${hours === 1 ? "" : "s"}`,
      version: 1,
    };
  }
  const order = await database.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  const defaultPolicy = order?.organizationId
    ? await database.query.organizationRefundPolicies.findFirst({
        where: and(
          eq(organizationRefundPolicies.organizationId, order.organizationId),
          eq(organizationRefundPolicies.isDefault, true),
          eq(organizationRefundPolicies.active, true),
        ),
      })
    : undefined;
  return {
    sessionId: undefined,
    startsAt: undefined,
    mode:
      defaultPolicy?.mode === "non-refundable"
        ? ("non-refundable" as const)
        : ("refundable" as const),
    refundBeforeMinutes:
      defaultPolicy?.mode === "non-refundable"
        ? undefined
        : (defaultPolicy?.refundBeforeMinutes ?? DEFAULT_REFUND_MINUTES),
    name: defaultPolicy?.name ?? "Flexible · 24 hours",
    version: defaultPolicy?.version ?? 1,
    policyId: defaultPolicy?.id,
  };
}

export function allocateStripeFundFees(input: {
  readonly actualFeeMinor?: number;
  readonly configuredProcessingFeeMinor: number;
  readonly configuredOrganizationFeeMinor: number;
  readonly configuredConsumerFeeMinor: number;
}): {
  readonly processingFeeMinor: number;
  readonly organizationFeeMinor: number;
  readonly consumerFeeMinor: number;
} {
  for (const amount of [
    input.actualFeeMinor,
    input.configuredProcessingFeeMinor,
    input.configuredOrganizationFeeMinor,
    input.configuredConsumerFeeMinor,
  ]) {
    if (amount !== undefined && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw new Error("Fund fees must be non-negative cents.");
    }
  }
  if (input.actualFeeMinor === undefined) {
    return {
      processingFeeMinor: input.configuredProcessingFeeMinor,
      organizationFeeMinor: input.configuredOrganizationFeeMinor,
      consumerFeeMinor: input.configuredConsumerFeeMinor,
    };
  }
  const organizationFeeMinor = Math.min(
    input.actualFeeMinor,
    input.configuredOrganizationFeeMinor,
  );
  const consumerFeeMinor = Math.min(
    Math.max(0, input.actualFeeMinor - organizationFeeMinor),
    input.configuredConsumerFeeMinor,
  );
  return {
    organizationFeeMinor,
    consumerFeeMinor,
    processingFeeMinor: Math.max(
      0,
      input.actualFeeMinor - organizationFeeMinor - consumerFeeMinor,
    ),
  };
}

export async function recordPaymentFundSchedule(input: {
  readonly orderId: string;
  readonly paymentId?: string;
  readonly installmentId?: string;
  readonly lineage?: StripePaymentLineage;
  readonly processorAvailableAt?: Date;
  readonly policyOverride?: {
    readonly mode: "refundable" | "non-refundable";
    readonly refundBeforeMinutes?: number;
    readonly releaseAt?: Date;
    readonly name: string;
    readonly version: number;
  };
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  const order = await database.query.orders.findFirst({
    where: eq(orders.id, input.orderId),
  });
  if (!order?.organizationId || order.totalMinor <= 0) return;
  await ensureMoneyDefaults(order.organizationId);
  const [payment, fees, resolvedPolicy] = await Promise.all([
    database.query.payments.findFirst({
      where: input.paymentId
        ? and(eq(payments.id, input.paymentId), eq(payments.orderId, order.id))
        : eq(payments.orderId, order.id),
      orderBy: [desc(payments.createdAt)],
    }),
    database
      .select()
      .from(appliedFees)
      .where(eq(appliedFees.orderId, order.id)),
    resolveOrderPolicy(order.id),
  ]);
  if (!payment || payment.status !== "succeeded") return;
  const policy = input.policyOverride
    ? {
        sessionId: undefined,
        startsAt: input.policyOverride.releaseAt,
        mode: input.policyOverride.mode,
        refundBeforeMinutes: input.policyOverride.refundBeforeMinutes,
        name: input.policyOverride.name,
        version: input.policyOverride.version,
        policyId: undefined,
      }
    : resolvedPolicy;
  const capturedGrossMinor = input.lineage?.grossMinor ?? payment.amountMinor;
  const captureRatio = Math.min(1, capturedGrossMinor / order.totalMinor);
  const configuredProcessingFeeMinor = fees
    .filter(
      (fee) =>
        fee.payer === "operator" &&
        (fee.ruleId.includes("processing") ||
          fee.ruleId.includes("operator-online") ||
          fee.ruleId.includes("operator-present") ||
          fee.ruleId.includes("operator-ach")),
    )
    .reduce((sum, fee) => sum + fee.amountMinor, 0);
  const allocatedConfiguredProcessingFeeMinor = Math.round(
    configuredProcessingFeeMinor * captureRatio,
  );
  const organizationFeeMinor = fees
    .filter(
      (fee) =>
        fee.payer === "operator" &&
        !fee.ruleId.includes("processing") &&
        !fee.ruleId.includes("operator-online") &&
        !fee.ruleId.includes("operator-present") &&
        !fee.ruleId.includes("operator-ach"),
    )
    .reduce((sum, fee) => sum + fee.amountMinor, 0);
  const consumerFeeMinor = fees
    .filter((fee) => fee.payer === "consumer")
    .reduce((sum, fee) => sum + fee.amountMinor, 0);
  const allocatedOrganizationFeeMinor = Math.round(
    organizationFeeMinor * captureRatio,
  );
  const allocatedConsumerFeeMinor = Math.round(consumerFeeMinor * captureRatio);
  const allocatedTaxMinor = Math.round(order.taxTotalMinor * captureRatio);
  const reconciledFees = allocateStripeFundFees({
    actualFeeMinor: input.lineage?.feeMinor,
    configuredProcessingFeeMinor: allocatedConfiguredProcessingFeeMinor,
    configuredOrganizationFeeMinor: allocatedOrganizationFeeMinor,
    configuredConsumerFeeMinor: allocatedConsumerFeeMinor,
  });
  const netMinor =
    input.lineage === undefined
      ? Math.max(
          0,
          capturedGrossMinor -
            reconciledFees.consumerFeeMinor -
            reconciledFees.processingFeeMinor -
            reconciledFees.organizationFeeMinor -
            allocatedTaxMinor,
        )
      : Math.max(0, input.lineage.netMinor - allocatedTaxMinor);
  const processorAvailableAt =
    input.lineage?.availableAt ?? input.processorAvailableAt ?? input.now;
  const availability = calculateFundAvailability({
    policyMode: policy.mode,
    refundBeforeMinutes: policy.refundBeforeMinutes,
    eventStartsAt: policy.startsAt,
    orderCreatedAt: order.createdAt,
    processorAvailableAt,
    now: input.now,
  });
  await database
    .insert(paymentFundSchedules)
    .values({
      organizationId: order.organizationId,
      orderId: order.id,
      paymentId: payment.id,
      installmentId: input.installmentId,
      stripeTransferId: input.lineage?.stripeTransferId,
      stripeBalanceTransactionId: input.lineage?.stripeBalanceTransactionId,
      sessionId: policy.sessionId,
      policyId: policy.policyId,
      policyName: policy.name,
      policyVersion: policy.version,
      policyMode: policy.mode,
      refundBeforeMinutes: policy.refundBeforeMinutes,
      eventStartsAt: policy.startsAt,
      policyReleaseAt: availability.policyReleaseAt,
      processorAvailableAt,
      availableAt: availability.availableAt,
      grossMinor: capturedGrossMinor,
      consumerFeeMinor: reconciledFees.consumerFeeMinor,
      processingFeeMinor: reconciledFees.processingFeeMinor,
      organizationFeeMinor: reconciledFees.organizationFeeMinor,
      taxMinor: allocatedTaxMinor,
      netMinor,
      currency: order.currency,
      status: availability.status,
      createdAt: payment.createdAt,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: paymentFundSchedules.paymentId,
      targetWhere: sql`${paymentFundSchedules.paymentId} IS NOT NULL`,
      set: {
        installmentId: input.installmentId,
        stripeTransferId: input.lineage?.stripeTransferId,
        stripeBalanceTransactionId: input.lineage?.stripeBalanceTransactionId,
        policyName: policy.name,
        policyVersion: policy.version,
        policyMode: policy.mode,
        refundBeforeMinutes: policy.refundBeforeMinutes,
        eventStartsAt: policy.startsAt,
        policyReleaseAt: availability.policyReleaseAt,
        grossMinor: capturedGrossMinor,
        consumerFeeMinor: reconciledFees.consumerFeeMinor,
        processingFeeMinor: reconciledFees.processingFeeMinor,
        organizationFeeMinor: reconciledFees.organizationFeeMinor,
        taxMinor: allocatedTaxMinor,
        netMinor,
        processorAvailableAt,
        availableAt: availability.availableAt,
        status: availability.status,
        createdAt: payment.createdAt,
        updatedAt: input.now,
      },
    });
}

export async function recordStripePaymentLineage(input: {
  readonly organizationId: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly lineage: StripePaymentLineage;
  readonly now: Date;
}): Promise<void> {
  const database = getDatabase();
  await database.batch([
    database
      .update(payments)
      .set({
        stripePaymentIntentId: input.lineage.stripePaymentIntentId,
        stripeChargeId: input.lineage.stripeChargeId,
        stripeApplicationFeeId: input.lineage.stripeApplicationFeeId,
        stripeTransferId: input.lineage.stripeTransferId,
        stripeDestinationPaymentId: input.lineage.stripeDestinationPaymentId,
        stripeBalanceTransactionId: input.lineage.stripeBalanceTransactionId,
        updatedAt: input.now,
      })
      .where(eq(payments.id, input.paymentId)),
    database
      .insert(stripeTransactionLinks)
      .values({
        organizationId: input.organizationId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        ...input.lineage,
        createdAt: input.now,
      })
      .onConflictDoUpdate({
        target: stripeTransactionLinks.paymentId,
        set: {
          stripePaymentIntentId: input.lineage.stripePaymentIntentId,
          stripeChargeId: input.lineage.stripeChargeId,
          stripeTransferId: input.lineage.stripeTransferId,
          stripeDestinationPaymentId: input.lineage.stripeDestinationPaymentId,
          stripeBalanceTransactionId: input.lineage.stripeBalanceTransactionId,
          stripeApplicationFeeId: input.lineage.stripeApplicationFeeId,
          grossMinor: input.lineage.grossMinor,
          feeMinor: input.lineage.feeMinor,
          netMinor: input.lineage.netMinor,
          currency: input.lineage.currency,
          availableAt: input.lineage.availableAt,
          livemode: input.lineage.livemode,
        },
      }),
  ]);
}

function stripeLineageFromStored(
  stored: typeof stripeTransactionLinks.$inferSelect,
): StripePaymentLineage {
  return {
    stripePaymentIntentId: stored.stripePaymentIntentId,
    stripeChargeId: stored.stripeChargeId,
    stripeTransferId: stored.stripeTransferId ?? undefined,
    stripeDestinationPaymentId: stored.stripeDestinationPaymentId ?? undefined,
    stripeBalanceTransactionId: stored.stripeBalanceTransactionId ?? undefined,
    stripeApplicationFeeId: stored.stripeApplicationFeeId ?? undefined,
    grossMinor: stored.grossMinor,
    feeMinor: stored.feeMinor,
    netMinor: stored.netMinor,
    currency: stored.currency,
    availableAt: stored.availableAt ?? undefined,
    livemode: stored.livemode,
  };
}

export function buildStripeCaptureAmounts(input: {
  readonly grossMinor: number;
  readonly feeMinor: number;
  readonly netMinor: number;
  readonly taxMinor: number;
}): {
  readonly grossMinor: number;
  readonly feeMinor: number;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly revenueMinor: number;
} {
  for (const amount of [
    input.grossMinor,
    input.feeMinor,
    input.netMinor,
    input.taxMinor,
  ]) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error("Stripe capture amounts must be non-negative cents.");
    }
  }
  if (input.grossMinor <= 0) {
    throw new Error("Stripe capture gross must be positive.");
  }
  if (input.feeMinor + input.netMinor !== input.grossMinor) {
    throw new Error("Stripe capture gross does not equal fee plus net.");
  }
  if (input.taxMinor > input.grossMinor) {
    throw new Error("Stripe capture tax cannot exceed gross.");
  }
  return {
    ...input,
    revenueMinor: input.grossMinor - input.taxMinor,
  };
}

async function postGenericPaymentCaptureJournal(input: {
  readonly order: typeof orders.$inferSelect;
  readonly payment: typeof payments.$inferSelect;
  readonly lineage: StripePaymentLineage;
  readonly now: Date;
}): Promise<void> {
  if (!input.order.organizationId) return;
  const database = getDatabase();
  const idempotencyKey = `payment:${input.payment.id}:stripe-capture`;
  const [existing, legacyCatalogJournal] = await Promise.all([
    database.query.ledgerJournals.findFirst({
      where: and(
        eq(ledgerJournals.organizationId, input.order.organizationId),
        eq(ledgerJournals.sourceType, "payment-capture"),
        eq(ledgerJournals.sourceId, input.payment.id),
      ),
    }),
    database.query.ledgerJournals.findFirst({
      where: and(
        eq(ledgerJournals.organizationId, input.order.organizationId),
        eq(
          ledgerJournals.idempotencyKey,
          `catalog-order:${input.order.id}:money`,
        ),
      ),
    }),
  ]);
  if (existing || legacyCatalogJournal) return;

  const captureRatio = Math.min(
    1,
    input.lineage.grossMinor / Math.max(1, input.order.totalMinor),
  );
  const amounts = buildStripeCaptureAmounts({
    grossMinor: input.lineage.grossMinor,
    feeMinor: input.lineage.feeMinor,
    netMinor: input.lineage.netMinor,
    taxMinor: Math.min(
      input.lineage.grossMinor,
      Math.round(input.order.taxTotalMinor * captureRatio),
    ),
  });
  const [clearingId, feeExpenseId, revenueId, taxPayableId, itemRows] =
    await Promise.all([
      amounts.netMinor > 0
        ? ensureLedgerAccount({
            organizationId: input.order.organizationId,
            code: "STRIPE_CLEARING",
            name: "Payment processor clearing",
            accountType: "asset",
            normalSide: "debit",
            unitKind: "money",
            unit: input.order.currency,
            currency: input.order.currency,
          })
        : Promise.resolve(undefined),
      amounts.feeMinor > 0
        ? ensureLedgerAccount({
            organizationId: input.order.organizationId,
            code: "PAYMENT_PROCESSING_FEES",
            name: "Payment processing fees",
            accountType: "expense",
            normalSide: "debit",
            unitKind: "money",
            unit: input.order.currency,
            currency: input.order.currency,
          })
        : Promise.resolve(undefined),
      amounts.revenueMinor > 0
        ? ensureLedgerAccount({
            organizationId: input.order.organizationId,
            code: "PAYMENT_REVENUE",
            name: "Payment revenue",
            accountType: "revenue",
            normalSide: "credit",
            unitKind: "money",
            unit: input.order.currency,
            currency: input.order.currency,
          })
        : Promise.resolve(undefined),
      amounts.taxMinor > 0
        ? ensureLedgerAccount({
            organizationId: input.order.organizationId,
            code: "SALES_TAX_PAYABLE",
            name: "Sales tax payable",
            accountType: "liability",
            normalSide: "credit",
            unitKind: "money",
            unit: input.order.currency,
            currency: input.order.currency,
          })
        : Promise.resolve(undefined),
      database
        .select({ description: orderItems.description })
        .from(orderItems)
        .where(eq(orderItems.orderId, input.order.id)),
    ]);
  const postings: LedgerPosting[] = [];
  if (clearingId && amounts.netMinor > 0) {
    postings.push({
      accountId: clearingId,
      side: "debit",
      amount: amounts.netMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (feeExpenseId && amounts.feeMinor > 0) {
    postings.push({
      accountId: feeExpenseId,
      side: "debit",
      amount: amounts.feeMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (revenueId && amounts.revenueMinor > 0) {
    postings.push({
      accountId: revenueId,
      side: "credit",
      amount: amounts.revenueMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  if (taxPayableId && amounts.taxMinor > 0) {
    postings.push({
      accountId: taxPayableId,
      side: "credit",
      amount: amounts.taxMinor,
      unit: input.order.currency,
      unitKind: "money",
      currency: input.order.currency,
    });
  }
  assertBalancedJournal(postings);
  const journalId = crypto.randomUUID();
  const title =
    itemRows.map((item) => item.description).join(", ") || "Duna payment";
  await database.batch([
    database.insert(ledgerJournals).values({
      id: journalId,
      organizationId: input.order.organizationId,
      idempotencyKey,
      sourceType: "payment-capture",
      sourceId: input.payment.id,
      description: `Payment captured · ${title}`,
      status: "draft",
      actorPersonId: input.order.buyerPersonId,
      occurredAt: input.payment.createdAt,
      metadata: {
        orderId: input.order.id,
        paymentId: input.payment.id,
        stripePaymentIntentId: input.lineage.stripePaymentIntentId,
        stripeChargeId: input.lineage.stripeChargeId,
        stripeTransferId: input.lineage.stripeTransferId,
        stripeDestinationPaymentId: input.lineage.stripeDestinationPaymentId,
        stripeBalanceTransactionId: input.lineage.stripeBalanceTransactionId,
        grossMinor: amounts.grossMinor,
        feeMinor: amounts.feeMinor,
        netMinor: amounts.netMinor,
        taxMinor: amounts.taxMinor,
        backfilledAt: input.now.toISOString(),
      },
    }),
    database.insert(ledgerEntries).values(
      postings.map((posting, sequence) => ({
        id: crypto.randomUUID(),
        organizationId: input.order.organizationId!,
        journalId,
        sequence,
        ...posting,
      })),
    ),
    database
      .update(ledgerJournals)
      .set({ status: "posted", postedAt: input.now })
      .where(eq(ledgerJournals.id, journalId)),
  ]);
}

export async function postReconciledPaymentJournal(input: {
  readonly order: typeof orders.$inferSelect;
  readonly payment: typeof payments.$inferSelect;
  readonly lineage: StripePaymentLineage;
  readonly now: Date;
}): Promise<void> {
  await postCatalogPaymentCapture(input.order.id, input.payment.id, input.now);
  await postGenericPaymentCaptureJournal(input);
}

export async function reconcileStripePaymentLineage(input?: {
  readonly limit?: number;
  readonly now?: Date;
}): Promise<{
  readonly inspected: number;
  readonly linked: number;
  readonly failed: number;
}> {
  const database = getDatabase();
  const now = input?.now ?? new Date();
  const candidates = await database
    .select({
      payment: payments,
      order: orders,
      organization: organizations,
      stripeLink: stripeTransactionLinks,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .innerJoin(organizations, eq(orders.organizationId, organizations.id))
    .leftJoin(
      stripeTransactionLinks,
      eq(stripeTransactionLinks.paymentId, payments.id),
    )
    .leftJoin(
      paymentFundSchedules,
      eq(paymentFundSchedules.paymentId, payments.id),
    )
    .leftJoin(
      ledgerJournals,
      and(
        eq(ledgerJournals.organizationId, organizations.id),
        eq(ledgerJournals.sourceType, "payment-capture"),
        sql`${ledgerJournals.sourceId} = ${payments.id}::text`,
      ),
    )
    .where(
      and(
        eq(payments.status, "succeeded"),
        isNotNull(organizations.stripeAccountId),
        sql`COALESCE(${payments.stripePaymentIntentId}, ${orders.stripePaymentIntentId}) IS NOT NULL`,
        or(
          sql`${stripeTransactionLinks.id} IS NULL`,
          sql`${stripeTransactionLinks.stripeBalanceTransactionId} IS NULL`,
          sql`${paymentFundSchedules.id} IS NULL`,
          sql`${paymentFundSchedules.createdAt} IS DISTINCT FROM ${payments.createdAt}`,
          sql`(
            ${paymentFundSchedules.consumerFeeMinor} +
            ${paymentFundSchedules.processingFeeMinor} +
            ${paymentFundSchedules.organizationFeeMinor}
          ) IS DISTINCT FROM ${stripeTransactionLinks.feeMinor}`,
          sql`${paymentFundSchedules.netMinor} IS DISTINCT FROM GREATEST(
            0,
            ${stripeTransactionLinks.netMinor} - ${paymentFundSchedules.taxMinor}
          )`,
          and(
            sql`${ledgerJournals.id} IS NULL`,
            sql`NOT EXISTS (
              SELECT 1
              FROM ledger_journals legacy_journal
              WHERE legacy_journal.organization_id = ${organizations.id}
                AND legacy_journal.idempotency_key = 'catalog-order:' || ${orders.id}::text || ':money'
            )`,
          ),
        ),
      ),
    )
    .orderBy(asc(payments.createdAt))
    .limit(Math.min(500, Math.max(1, input?.limit ?? 100)));
  let linked = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const paymentIntentId =
      candidate.payment.stripePaymentIntentId ??
      candidate.order.stripePaymentIntentId;
    const connectedAccountId = candidate.organization.stripeAccountId;
    if (!paymentIntentId || !connectedAccountId) continue;
    try {
      const lineage = candidate.stripeLink?.stripeBalanceTransactionId
        ? stripeLineageFromStored(candidate.stripeLink)
        : await retrieveStripePaymentLineage({
            paymentIntentId,
            connectedAccountId,
          });
      await recordStripePaymentLineage({
        organizationId: candidate.organization.id,
        orderId: candidate.order.id,
        paymentId: candidate.payment.id,
        lineage,
        now,
      });
      await recordPaymentFundSchedule({
        orderId: candidate.order.id,
        paymentId: candidate.payment.id,
        lineage,
        now,
      });
      await postReconciledPaymentJournal({
        order: candidate.order,
        payment: candidate.payment,
        lineage,
        now,
      });
      linked += 1;
    } catch {
      failed += 1;
    }
  }
  return { inspected: candidates.length, linked, failed };
}

export async function releaseEligibleFunds(now = new Date()): Promise<number> {
  return getDatabase()
    .update(paymentFundSchedules)
    .set({ status: "available", updatedAt: now })
    .where(
      and(
        inArray(paymentFundSchedules.status, ["pending-clearance", "held"]),
        lte(paymentFundSchedules.availableAt, now),
      ),
    )
    .returning({ id: paymentFundSchedules.id })
    .then((rows) => rows.length);
}

function emptyConnect(
  organization: typeof organizations.$inferSelect,
): OrganizationMoneyWorkspace["connect"] {
  return {
    accountId: organization.stripeAccountId ?? undefined,
    connected: Boolean(organization.stripeAccountId),
    chargesEnabled: organization.stripeChargesEnabled,
    payoutsEnabled: false,
    bankStatus: organization.stripeAccountId ? "unavailable" : "missing",
    earnings30d: {
      grossMinor: 0,
      netMinor: 0,
      feesMinor: 0,
      payoutsMinor: 0,
      points: [],
    },
    bankAccounts: [],
    activity: [],
    disputes: [],
    requirementsDue: [],
    liveData: false,
    livemode: undefined,
  };
}

export async function loadOrganizationMoneyWorkspace(
  organizationId: string,
  now = new Date(),
): Promise<OrganizationMoneyWorkspace> {
  await ensureMoneyDefaults(organizationId);
  await releaseEligibleFunds(now);
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  const [settings, refundPolicies, fundRows, payoutRows, disputeRows] =
    await Promise.all([
      database.query.organizationMoneySettings.findFirst({
        where: eq(organizationMoneySettings.organizationId, organizationId),
      }),
      database
        .select()
        .from(organizationRefundPolicies)
        .where(eq(organizationRefundPolicies.organizationId, organizationId))
        .orderBy(
          desc(organizationRefundPolicies.isDefault),
          asc(organizationRefundPolicies.name),
        ),
      database
        .select({
          fund: paymentFundSchedules,
          order: orders,
          customerName: people.displayName,
          payment: payments,
          stripeLink: stripeTransactionLinks,
        })
        .from(paymentFundSchedules)
        .innerJoin(orders, eq(paymentFundSchedules.orderId, orders.id))
        .innerJoin(people, eq(orders.buyerPersonId, people.id))
        .leftJoin(payments, eq(paymentFundSchedules.paymentId, payments.id))
        .leftJoin(
          stripeTransactionLinks,
          eq(stripeTransactionLinks.paymentId, payments.id),
        )
        .where(eq(paymentFundSchedules.organizationId, organizationId))
        .orderBy(desc(paymentFundSchedules.createdAt))
        .limit(250),
      database
        .select()
        .from(payouts)
        .where(eq(payouts.organizationId, organizationId))
        .orderBy(desc(payouts.createdAt))
        .limit(100),
      database
        .select()
        .from(disputes)
        .where(eq(disputes.organizationId, organizationId))
        .orderBy(desc(disputes.createdAt))
        .limit(100),
    ]);
  if (!settings) throw new Error("Money settings could not be initialized.");
  const orderIds = fundRows.map((row) => row.order.id);
  const itemRows = orderIds.length
    ? await database
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
    : [];
  const descriptions = new Map<string, string>();
  for (const item of itemRows) {
    const current = descriptions.get(item.orderId);
    descriptions.set(
      item.orderId,
      current ? `${current}, ${item.description}` : item.description,
    );
  }
  let connect = emptyConnect(organization);
  if (organization.stripeAccountId) {
    try {
      connect = await loadConnectedAccountMoney({
        accountId: organization.stripeAccountId,
        currency: organization.currency,
      });
    } catch {
      connect = emptyConnect(organization);
    }
  }
  const remaining = (fund: typeof paymentFundSchedules.$inferSelect) =>
    Math.max(0, fund.netMinor - fund.refundedMinor - fund.disputedMinor);
  const ledgerAvailableMinor = fundRows
    .filter((row) => row.fund.status === "available")
    .reduce((sum, row) => sum + remaining(row.fund), 0);
  const ledgerHeldMinor = fundRows
    .filter((row) => row.fund.status === "held")
    .reduce((sum, row) => sum + remaining(row.fund), 0);
  const ledgerPendingMinor = fundRows
    .filter((row) => row.fund.status === "pending-clearance")
    .reduce((sum, row) => sum + remaining(row.fund), 0);
  const inTransitMinor = payoutRows
    .filter((row) => ["pending", "in_transit"].includes(row.status))
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const projectedBalance = projectOrganizationBalance({
    ledgerAvailableMinor,
    ledgerHeldMinor,
    ledgerPendingMinor,
    processorAvailableMinor: connect.liveData
      ? connect.stripeAvailableMinor
      : undefined,
    processorPendingMinor: connect.liveData
      ? connect.stripePendingMinor
      : undefined,
  });
  const nextRelease = fundRows
    .filter(
      (row) =>
        ["held", "pending-clearance"].includes(row.fund.status) &&
        row.fund.availableAt,
    )
    .toSorted(
      (left, right) =>
        left.fund.availableAt!.getTime() - right.fund.availableAt!.getTime(),
    )[0];
  const chartStart = new Date(now.getTime() - 29 * 24 * 60 * 60_000);
  chartStart.setUTCHours(0, 0, 0, 0);
  const points = Array.from({ length: 30 }, (_, index) => {
    const point = new Date(chartStart.getTime() + index * 24 * 60 * 60_000);
    const date = point.toISOString().slice(0, 10);
    const rows = fundRows.filter(
      (row) => row.fund.createdAt.toISOString().slice(0, 10) === date,
    );
    return {
      date,
      grossMinor: rows.reduce((sum, row) => sum + row.fund.grossMinor, 0),
      netMinor: rows.reduce((sum, row) => sum + row.fund.netMinor, 0),
    };
  });
  return {
    generatedAt: now.toISOString(),
    currency: currency(organization.currency),
    balance: {
      ...projectedBalance,
      inTransitMinor,
      nextReleaseAt: nextRelease?.fund.availableAt?.toISOString(),
      nextReleaseMinor: nextRelease ? remaining(nextRelease.fund) : 0,
    },
    earnings: {
      grossMinor: fundRows.reduce((sum, row) => sum + row.fund.grossMinor, 0),
      netMinor: fundRows.reduce((sum, row) => sum + row.fund.netMinor, 0),
      feesMinor: fundRows.reduce(
        (sum, row) =>
          sum +
          row.fund.consumerFeeMinor +
          row.fund.processingFeeMinor +
          row.fund.organizationFeeMinor,
        0,
      ),
      refundsMinor: fundRows.reduce(
        (sum, row) => sum + row.fund.refundedMinor,
        0,
      ),
      points,
    },
    connect,
    settings: {
      payoutInterval: settings.payoutInterval as PayoutInterval,
      weeklyPayoutDay: settings.weeklyPayoutDay as Weekday,
      monthlyPayoutDay: settings.monthlyPayoutDay,
      minimumPayoutMinor: settings.minimumPayoutMinor,
      statementDescriptor: settings.statementDescriptor ?? undefined,
      payoutStatementDescriptor:
        settings.payoutStatementDescriptor ?? undefined,
      stripeSettingsStatus: settings.stripeSettingsStatus as
        "not-synced" | "pending" | "synced" | "failed",
      stripeSettingsSyncedAt: settings.stripeSettingsSyncedAt?.toISOString(),
      stripeSettingsError: settings.stripeSettingsError ?? undefined,
      lastAutomaticPayoutAt: settings.lastAutomaticPayoutAt?.toISOString(),
    },
    refundPolicies: refundPolicies.map((policy) => ({
      id: policy.id,
      name: policy.name,
      mode: policy.mode === "non-refundable" ? "non-refundable" : "refundable",
      refundBeforeMinutes: policy.refundBeforeMinutes ?? undefined,
      terms: policy.terms,
      version: policy.version,
      isDefault: policy.isDefault,
      active: policy.active,
    })),
    transactions: fundRows.map(
      ({ fund, order, customerName, payment, stripeLink }) => ({
        id: fund.id,
        orderId: order.id,
        paymentId: payment?.id,
        description: descriptions.get(order.id) ?? "Duna purchase",
        customerName,
        grossMinor: fund.grossMinor,
        consumerFeeMinor: fund.consumerFeeMinor,
        processingFeeMinor: fund.processingFeeMinor,
        organizationFeeMinor: fund.organizationFeeMinor,
        taxMinor: fund.taxMinor,
        netMinor: fund.netMinor,
        refundedMinor: fund.refundedMinor,
        currency: currency(fund.currency),
        status: status(fund.status),
        policyName: fund.policyName,
        availableAt: fund.availableAt?.toISOString(),
        occurredAt: fund.createdAt.toISOString(),
        stripePaymentIntentId:
          stripeLink?.stripePaymentIntentId ??
          payment?.stripePaymentIntentId ??
          undefined,
        stripeChargeId:
          stripeLink?.stripeChargeId ?? payment?.stripeChargeId ?? undefined,
        stripeTransferId: stripeLink?.stripeTransferId ?? undefined,
        stripeDestinationPaymentId:
          stripeLink?.stripeDestinationPaymentId ?? undefined,
        stripeBalanceTransactionId:
          stripeLink?.stripeBalanceTransactionId ?? undefined,
        reconciled: Boolean(stripeLink?.stripeBalanceTransactionId),
      }),
    ),
    payouts: payoutRows.map((row) => ({
      id: row.id,
      stripePayoutId: row.stripePayoutId ?? undefined,
      amountMinor: Math.max(0, row.amountMinor),
      currency: currency(row.currency),
      status: row.status,
      expectedArrivalAt: row.expectedArrivalAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    disputes: [
      ...connect.disputes
        .filter(
          (stripeDispute) =>
            !disputeRows.some(
              (storedDispute) =>
                storedDispute.stripeDisputeId === stripeDispute.id,
            ),
        )
        .map((stripeDispute) => ({
          id: stripeDispute.id,
          stripeDisputeId: stripeDispute.id,
          kind: stripeDispute.kind,
          status: stripeDispute.status,
          amountMinor: stripeDispute.amountMinor,
          currency: stripeDispute.currency,
          dueAt: stripeDispute.dueAt,
          createdAt: stripeDispute.createdAt,
        })),
      ...disputeRows.map((row) => ({
        id: row.id,
        orderId: row.orderId ?? undefined,
        stripeDisputeId: row.stripeDisputeId ?? undefined,
        kind: row.kind,
        status: row.status,
        amountMinor: Math.max(0, row.amountMinor ?? 0),
        currency: currency(row.currency ?? organization.currency),
        dueAt: row.dueAt?.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
    ].toSorted(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    ),
  };
}

export async function updateOrganizationMoneySettings(input: {
  readonly actor: ApiActor;
  readonly payoutInterval: PayoutInterval;
  readonly weeklyPayoutDay: Weekday;
  readonly monthlyPayoutDay: number;
  readonly minimumPayoutMinor: number;
  readonly statementDescriptor?: string;
  readonly payoutStatementDescriptor?: string;
  readonly now: Date;
}): Promise<void> {
  const organizationId = input.actor.organizationId;
  if (!organizationId) throw new Error("Choose an organization first.");
  if (
    !Number.isSafeInteger(input.minimumPayoutMinor) ||
    input.minimumPayoutMinor < 0
  ) {
    throw new Error("Minimum payout must be a non-negative amount.");
  }
  if (
    !Number.isSafeInteger(input.monthlyPayoutDay) ||
    input.monthlyPayoutDay < 1 ||
    input.monthlyPayoutDay > 28
  ) {
    throw new Error("Monthly payout day must be between 1 and 28.");
  }
  const database = getDatabase();
  const organization = await database.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) throw new Error("Organization was not found.");
  const cardDescriptor = descriptor(input.statementDescriptor);
  const bankDescriptor = descriptor(input.payoutStatementDescriptor);
  await ensureMoneyDefaults(organizationId);
  await database
    .update(organizationMoneySettings)
    .set({
      payoutInterval: input.payoutInterval,
      weeklyPayoutDay: input.weeklyPayoutDay,
      monthlyPayoutDay: input.monthlyPayoutDay,
      minimumPayoutMinor: input.minimumPayoutMinor,
      statementDescriptor: cardDescriptor ?? null,
      payoutStatementDescriptor: bankDescriptor ?? null,
      stripeSettingsStatus: organization.stripeAccountId
        ? "pending"
        : "not-synced",
      stripeSettingsError: null,
      updatedAt: input.now,
    })
    .where(eq(organizationMoneySettings.organizationId, organizationId));
  if (!organization.stripeAccountId) return;
  try {
    await configureConnectedAccountMoney({
      accountId: organization.stripeAccountId,
      statementDescriptor: cardDescriptor,
      payoutStatementDescriptor: bankDescriptor,
    });
    await database
      .update(organizationMoneySettings)
      .set({
        stripeSettingsStatus: "synced",
        stripeSettingsSyncedAt: input.now,
        stripeSettingsError: null,
        updatedAt: input.now,
      })
      .where(eq(organizationMoneySettings.organizationId, organizationId));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Stripe settings could not be synchronized.";
    await database
      .update(organizationMoneySettings)
      .set({
        stripeSettingsStatus: "failed",
        stripeSettingsError: message,
        updatedAt: input.now,
      })
      .where(eq(organizationMoneySettings.organizationId, organizationId));
    throw new Error(
      `Money settings were saved, but Stripe needs attention: ${message}`,
      { cause: error },
    );
  }
}

export async function createOrganizationRefundPolicy(input: {
  readonly actor: ApiActor;
  readonly name: string;
  readonly mode: "refundable" | "non-refundable";
  readonly refundBeforeMinutes?: number;
  readonly terms: string;
  readonly makeDefault: boolean;
  readonly now: Date;
}): Promise<string> {
  const organizationId = input.actor.organizationId;
  if (!organizationId) throw new Error("Choose an organization first.");
  if (!input.name.trim()) throw new Error("Name the refund policy.");
  const refundBeforeMinutes =
    input.mode === "non-refundable" ? undefined : input.refundBeforeMinutes;
  if (
    input.mode === "refundable" &&
    (!Number.isSafeInteger(refundBeforeMinutes) || refundBeforeMinutes! < 0)
  ) {
    throw new Error("Choose a valid refund cutoff.");
  }
  const id = crypto.randomUUID();
  await getTransactionalDatabase().transaction(async (transaction) => {
    if (input.makeDefault) {
      await transaction
        .update(organizationRefundPolicies)
        .set({ isDefault: false, updatedAt: input.now })
        .where(eq(organizationRefundPolicies.organizationId, organizationId));
    }
    await transaction.insert(organizationRefundPolicies).values({
      id,
      organizationId,
      name: input.name.trim(),
      mode: input.mode,
      refundBeforeMinutes,
      terms: input.terms.trim(),
      isDefault: input.makeDefault,
      createdAt: input.now,
      updatedAt: input.now,
    });
  });
  return id;
}

function payoutDue(
  settings: typeof organizationMoneySettings.$inferSelect,
  now: Date,
): boolean {
  if (settings.payoutInterval === "manual") return false;
  const last = settings.lastAutomaticPayoutAt;
  if (settings.payoutInterval === "daily") {
    return (
      !last ||
      last.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)
    );
  }
  if (settings.payoutInterval === "weekly") {
    const weekdays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return (
      weekdays[now.getUTCDay()] === settings.weeklyPayoutDay &&
      (!last || now.getTime() - last.getTime() >= 20 * 60 * 60_000)
    );
  }
  return (
    now.getUTCDate() === settings.monthlyPayoutDay &&
    (!last ||
      last.getUTCMonth() !== now.getUTCMonth() ||
      last.getUTCFullYear() !== now.getUTCFullYear())
  );
}

async function createEligibleOrganizationPayout(input: {
  readonly organization: typeof organizations.$inferSelect;
  readonly stripeSettingsStatus: string;
  readonly minimumPayoutMinor: number;
  readonly idempotencyKey: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly amountMinor: number } | undefined> {
  const stripeAccountId = input.organization.stripeAccountId;
  if (!stripeAccountId) return undefined;
  if (input.stripeSettingsStatus !== "synced") {
    throw new Error(
      "Payouts stay locked until Stripe is synchronized to Duna's refund-safe manual rail.",
    );
  }
  return getTransactionalDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`money-payout:${input.organization.id}`}))`,
    );
    const eligible = await transaction
      .select()
      .from(paymentFundSchedules)
      .where(
        and(
          eq(paymentFundSchedules.organizationId, input.organization.id),
          eq(paymentFundSchedules.status, "available"),
          isNotNull(paymentFundSchedules.stripeBalanceTransactionId),
        ),
      )
      .orderBy(asc(paymentFundSchedules.availableAt));
    if (!eligible.length) return undefined;
    const stripeMoney = await loadConnectedAccountMoney({
      accountId: stripeAccountId,
      currency: input.organization.currency,
    });
    let room = stripeMoney.stripeAvailableMinor ?? 0;
    const selected: typeof eligible = [];
    for (const fund of eligible) {
      const amount = Math.max(
        0,
        fund.netMinor - fund.refundedMinor - fund.disputedMinor,
      );
      if (amount > 0 && amount <= room) {
        selected.push(fund);
        room -= amount;
      }
    }
    const amountMinor = selected.reduce(
      (sum, fund) =>
        sum +
        Math.max(0, fund.netMinor - fund.refundedMinor - fund.disputedMinor),
      0,
    );
    if (amountMinor < input.minimumPayoutMinor || amountMinor <= 0) {
      return undefined;
    }
    const payout = await createConnectedAccountPayout({
      accountId: stripeAccountId,
      amountMinor,
      currency: input.organization.currency,
      idempotencyKey: input.idempotencyKey,
    });
    const payoutId = crypto.randomUUID();
    await transaction.insert(payouts).values({
      id: payoutId,
      organizationId: input.organization.id,
      stripePayoutId: payout.id,
      amountMinor,
      currency: input.organization.currency,
      status: payout.status,
      expectedArrivalAt: payout.expectedArrivalAt,
      composition: Object.fromEntries(
        selected.map((fund) => [
          fund.id,
          Math.max(0, fund.netMinor - fund.refundedMinor - fund.disputedMinor),
        ]),
      ),
      createdAt: input.now,
      updatedAt: input.now,
    });
    await transaction.insert(payoutAllocations).values(
      selected.map((fund) => ({
        payoutId,
        paymentFundScheduleId: fund.id,
        amountMinor: Math.max(
          0,
          fund.netMinor - fund.refundedMinor - fund.disputedMinor,
        ),
        currency: fund.currency,
        createdAt: input.now,
      })),
    );
    await transaction
      .update(paymentFundSchedules)
      .set({
        payoutId,
        status: "payout-pending",
        updatedAt: input.now,
      })
      .where(
        inArray(
          paymentFundSchedules.id,
          selected.map((fund) => fund.id),
        ),
      );
    return { id: payoutId, amountMinor };
  });
}

export async function createManualOrganizationPayout(input: {
  readonly actor: ApiActor;
  readonly idempotencyKey: string;
  readonly now: Date;
}): Promise<{ readonly id: string; readonly amountMinor: number }> {
  const organizationId = input.actor.organizationId;
  if (!organizationId) throw new Error("Choose an organization first.");
  await releaseEligibleFunds(input.now);
  const organization = await getDatabase().query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization?.stripeAccountId) {
    throw new Error("Connect and verify a payout bank before paying out.");
  }
  const settings =
    await getDatabase().query.organizationMoneySettings.findFirst({
      where: eq(organizationMoneySettings.organizationId, organizationId),
    });
  const result = await createEligibleOrganizationPayout({
    organization,
    stripeSettingsStatus: settings?.stripeSettingsStatus ?? "not-synced",
    minimumPayoutMinor: 0,
    idempotencyKey: `duna-manual-payout:${organizationId}:${input.idempotencyKey}`,
    now: input.now,
  });
  if (!result) {
    throw new Error("There are no cleared, refund-safe funds to pay out.");
  }
  return result;
}

export async function processAutomaticOrganizationPayouts(
  now = new Date(),
): Promise<{ readonly organizations: number; readonly payouts: number }> {
  await releaseEligibleFunds(now);
  const database = getDatabase();
  const settingsRows = await database
    .select({
      settings: organizationMoneySettings,
      organization: organizations,
    })
    .from(organizationMoneySettings)
    .innerJoin(
      organizations,
      eq(organizationMoneySettings.organizationId, organizations.id),
    )
    .where(
      or(
        eq(organizationMoneySettings.payoutInterval, "daily"),
        eq(organizationMoneySettings.payoutInterval, "weekly"),
        eq(organizationMoneySettings.payoutInterval, "monthly"),
      ),
    );
  let payoutCount = 0;
  for (const row of settingsRows) {
    if (!payoutDue(row.settings, now) || !row.organization.stripeAccountId)
      continue;
    const payout = await createEligibleOrganizationPayout({
      organization: row.organization,
      stripeSettingsStatus: row.settings.stripeSettingsStatus,
      minimumPayoutMinor: row.settings.minimumPayoutMinor,
      idempotencyKey: `duna-auto-payout:${row.organization.id}:${now.toISOString().slice(0, 10)}`,
      now,
    });
    if (!payout) continue;
    await database
      .update(organizationMoneySettings)
      .set({ lastAutomaticPayoutAt: now, updatedAt: now })
      .where(eq(organizationMoneySettings.organizationId, row.organization.id));
    payoutCount += 1;
  }
  return { organizations: settingsRows.length, payouts: payoutCount };
}

export async function synchronizeMoneyPayout(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly now: Date;
}): Promise<void> {
  const stripePayoutId =
    typeof input.object.id === "string" ? input.object.id : undefined;
  if (!stripePayoutId) return;
  const nextStatus =
    typeof input.object.status === "string" ? input.object.status : "pending";
  const database = getDatabase();
  const payout = await database.query.payouts.findFirst({
    where: eq(payouts.stripePayoutId, stripePayoutId),
  });
  if (!payout) return;
  await database.batch([
    database
      .update(payouts)
      .set({ status: nextStatus, updatedAt: input.now })
      .where(eq(payouts.id, payout.id)),
    database
      .update(paymentFundSchedules)
      .set({
        status:
          nextStatus === "paid"
            ? "paid-out"
            : nextStatus === "failed" || nextStatus === "canceled"
              ? "available"
              : "payout-pending",
        payoutId:
          nextStatus === "failed" || nextStatus === "canceled"
            ? null
            : payout.id,
        updatedAt: input.now,
      })
      .where(eq(paymentFundSchedules.payoutId, payout.id)),
  ]);
}

export async function synchronizeMoneyRefund(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly now: Date;
}): Promise<void> {
  const paymentIntentId =
    typeof input.object.payment_intent === "string"
      ? input.object.payment_intent
      : undefined;
  const amount =
    typeof input.object.amount === "number" ? input.object.amount : 0;
  if (!paymentIntentId || amount <= 0) return;
  const database = getDatabase();
  const payment = await database.query.payments.findFirst({
    where: eq(payments.stripePaymentIntentId, paymentIntentId),
  });
  const order = payment
    ? await database.query.orders.findFirst({
        where: eq(orders.id, payment.orderId),
      })
    : await database.query.orders.findFirst({
        where: eq(orders.stripePaymentIntentId, paymentIntentId),
      });
  if (!order) return;
  const fund = await database.query.paymentFundSchedules.findFirst({
    where: payment
      ? eq(paymentFundSchedules.paymentId, payment.id)
      : eq(paymentFundSchedules.orderId, order.id),
  });
  if (!fund) return;
  const refundedMinor = Math.min(fund.netMinor, fund.refundedMinor + amount);
  await database
    .update(paymentFundSchedules)
    .set({
      refundedMinor,
      status:
        refundedMinor >= fund.netMinor ? "refunded" : "partially-refunded",
      updatedAt: input.now,
    })
    .where(eq(paymentFundSchedules.id, fund.id));
}

export async function synchronizeMoneyDispute(input: {
  readonly object: Readonly<Record<string, unknown>>;
  readonly now: Date;
}): Promise<void> {
  const stripeDisputeId =
    typeof input.object.id === "string" ? input.object.id : undefined;
  const chargeId =
    typeof input.object.charge === "string" ? input.object.charge : undefined;
  if (!stripeDisputeId || !chargeId) return;
  const payment = await getDatabase().query.payments.findFirst({
    where: eq(payments.stripeChargeId, chargeId),
  });
  const order = payment
    ? await getDatabase().query.orders.findFirst({
        where: eq(orders.id, payment.orderId),
      })
    : undefined;
  if (!order?.organizationId) return;
  const amount =
    typeof input.object.amount === "number" ? input.object.amount : 0;
  const disputeStatus =
    typeof input.object.status === "string" ? input.object.status : "open";
  const resolved = disputeStatus === "won" || disputeStatus === "lost";
  const won = disputeStatus === "won";
  const database = getDatabase();
  await database
    .insert(disputes)
    .values({
      organizationId: order.organizationId,
      orderId: order.id,
      stripeDisputeId,
      kind:
        typeof input.object.reason === "string"
          ? input.object.reason
          : "chargeback",
      status: resolved ? "resolved" : "open",
      amountMinor: amount,
      currency:
        typeof input.object.currency === "string"
          ? input.object.currency.toUpperCase()
          : order.currency,
      evidence: { stripeStatus: disputeStatus },
      dueAt:
        typeof input.object.evidence_details === "object" &&
        input.object.evidence_details &&
        "due_by" in input.object.evidence_details &&
        typeof input.object.evidence_details.due_by === "number"
          ? new Date(input.object.evidence_details.due_by * 1_000)
          : undefined,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: disputes.stripeDisputeId,
      set: {
        status: resolved ? "resolved" : "open",
        evidence: { stripeStatus: disputeStatus },
        amountMinor: amount,
        updatedAt: input.now,
      },
    });
  const fund = await database.query.paymentFundSchedules.findFirst({
    where: eq(paymentFundSchedules.orderId, order.id),
  });
  if (!fund) return;
  await database
    .update(paymentFundSchedules)
    .set({
      disputedMinor: won ? 0 : Math.max(0, amount),
      status: won
        ? fund.availableAt && fund.availableAt <= input.now
          ? "available"
          : fund.processorAvailableAt && fund.processorAvailableAt <= input.now
            ? "held"
            : "pending-clearance"
        : "disputed",
      updatedAt: input.now,
    })
    .where(eq(paymentFundSchedules.id, fund.id));
}
