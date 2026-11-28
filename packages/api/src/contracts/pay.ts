/**
 * Contract: pay (owner: B2). Duna Pay: connected-account status, onboarding,
 * payout / tax / refund settings, the payout policy ledger (obligations,
 * release tranches, delivery events, holds, reserves, disputes, recoveries),
 * the publish gate and the Money home. Frozen by W3-0: B2 implements the
 * service behind these shapes; H10 builds the UI against them and the
 * fixtures in `@duna/core/demo/pay`. Procedures: `operator.pay.*` (see
 * docs/plan/w3-contracts.md and docs/plan/payout-policy.md).
 */
import {
  payAccountStatuses,
  payBankStatuses,
  payDeliveryEventKinds,
  payDeliveryRules,
  payDisputeStatuses,
  payHoldKinds,
  payHoldStatuses,
  payObligationStatuses,
  payRecoveryKinds,
  payRecoveryStatuses,
  payRefundSources,
  payReserveKinds,
  payReserveStatuses,
  payReserveTriggers,
  payTrancheKinds,
  payTrancheStatuses,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3BasisPointsSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3MoneySchema,
  w3PageInputSchema,
  w3PageSchema,
  w3PersonRefSchema,
} from "./w3-common";

export const payAccountStatusSchema = z.enum(payAccountStatuses);
export const payBankStatusSchema = z.enum(payBankStatuses);
export const payDeliveryRuleSchema = z.enum(payDeliveryRules);
export const payObligationStatusSchema = z.enum(payObligationStatuses);
export const payTrancheKindSchema = z.enum(payTrancheKinds);
export const payTrancheStatusSchema = z.enum(payTrancheStatuses);
export const payDeliveryEventKindSchema = z.enum(payDeliveryEventKinds);
export const payHoldKindSchema = z.enum(payHoldKinds);
export const payHoldStatusSchema = z.enum(payHoldStatuses);
export const payReserveKindSchema = z.enum(payReserveKinds);
export const payReserveTriggerSchema = z.enum(payReserveTriggers);
export const payReserveStatusSchema = z.enum(payReserveStatuses);
export const payDisputeStatusSchema = z.enum(payDisputeStatuses);
export const payRefundSourceSchema = z.enum(payRefundSources);
export const payRecoveryKindSchema = z.enum(payRecoveryKinds);
export const payRecoveryStatusSchema = z.enum(payRecoveryStatuses);

// ── Account and onboarding (DP-Status, DP-Verify, DP-Business) ──────────────

export const payRequirementSchema = z.object({
  code: z.string().min(1).max(96),
  label: z.string().min(1),
});

export const payAccountSchema = z.object({
  organizationId: w3IdSchema,
  status: payAccountStatusSchema,
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  cardPaymentsActive: z.boolean(),
  requirementsDue: z.array(payRequirementSchema),
  requirementsDueBy: w3DateTimeSchema.optional(),
  disabledReason: z.string().max(64).optional(),
  bank: z.object({
    status: payBankStatusSchema,
    last4: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    name: z.string().optional(),
  }),
  onboardingMethod: z.enum(["hosted", "embedded"]),
  business: z.object({
    legalName: z.string().optional(),
    businessType: z.string().max(32).optional(),
    whatYouSell: z.string().optional(),
  }),
  firstPayoutNotBefore: w3DateTimeSchema.optional(),
  firstPayoutDelayWaived: z.boolean(),
  startTranche: z.object({ optIn: z.boolean(), bps: w3BasisPointsSchema }),
  salesSuspendedAt: w3DateTimeSchema.optional(),
  syncedAt: w3DateTimeSchema.optional(),
});

export const payUpdateBusinessInputSchema = z.object({
  businessType: z.string().min(1).max(32).optional(),
  whatYouSell: z.string().min(1).max(500).optional(),
});

export const payStartOnboardingInputSchema = z.object({
  method: z.enum(["hosted", "embedded"]),
  /** Where the hosted flow returns, an HQ path ("/money/duna-pay"). */
  returnPath: z.string().startsWith("/").max(200),
});

/**
 * The processor session HQ opens. Duna never calls the processor while it is
 * not configured: the answer is then `not-configured` (honest state).
 */
export const payOnboardingSessionSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("hosted"),
    url: z.url(),
    expiresAt: w3DateTimeSchema,
  }),
  z.object({
    state: z.literal("embedded"),
    clientSecret: z.string().min(1),
    expiresAt: w3DateTimeSchema,
  }),
  z.object({ state: z.literal("not-configured") }),
  z.object({ state: z.literal("not-enabled") }),
]);

// ── Settings (DP-Payouts, DP-Policies) ──────────────────────────────────────

export const payPayoutIntervalSchema = z.enum([
  "manual",
  "daily",
  "weekly",
  "monthly",
]);
export const payWeekdaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
]);
const descriptorSchema = z
  .string()
  .min(5)
  .max(22)
  .regex(/^[A-Z0-9 .-]+$/);

/** `organization_money_settings`, reused. */
export const payPayoutSettingsSchema = z.object({
  interval: payPayoutIntervalSchema,
  weeklyDay: payWeekdaySchema,
  monthlyDay: z.number().int().min(1).max(28),
  minimumPayout: w3AmountSchema,
  statementDescriptor: descriptorSchema.optional(),
  payoutStatementDescriptor: descriptorSchema.optional(),
  syncStatus: z.enum(["not-synced", "synced", "failed"]),
});
export const payUpdatePayoutSettingsInputSchema = payPayoutSettingsSchema
  .omit({ syncStatus: true })
  .partial();

/** `organization_refund_policies`, reused. */
export const payRefundPolicySchema = z.object({
  id: w3IdSchema,
  name: z.string().min(1).max(80),
  mode: z.enum(["refundable", "non-refundable"]),
  refundBeforeMinutes: z.number().int().nonnegative().optional(),
  terms: z.string().max(4000),
  version: z.number().int().positive(),
  isDefault: z.boolean(),
  active: z.boolean(),
});
export const payUpsertRefundPolicyInputSchema = payRefundPolicySchema
  .omit({ id: true, version: true, active: true })
  .extend({ id: w3IdSchema.optional() });

export const payTaxSettingsSchema = z.object({
  marketplaceTaxEnabled: z.boolean(),
  registrationStatus: z.enum([
    "not-configured",
    "pending",
    "active",
    "restricted",
  ]),
  taxIdVerified: z.boolean(),
});
export const payUpdateTaxSettingsInputSchema = z.object({
  marketplaceTaxEnabled: z.boolean(),
});

// ── Balance and the payout-policy ledger ────────────────────────────────────

export const payBalanceSchema = z.object({
  available: w3MoneySchema,
  onTheWay: w3MoneySchema,
  held: w3MoneySchema,
  reserved: w3MoneySchema,
  /** Negative when refunds or disputes exceed held funds (§5.5). */
  net: w3MoneySchema,
  nextPayoutAt: w3DateTimeSchema.optional(),
  payoutState: z.enum(["scheduled", "paused", "manual", "not-ready"]),
});

export const payTrancheSchema = z.object({
  id: w3IdSchema,
  sequence: z.number().int().nonnegative(),
  kind: payTrancheKindSchema,
  status: payTrancheStatusSchema,
  amount: w3AmountSchema,
  sessionId: w3IdSchema.optional(),
  deliveryDueAt: w3DateTimeSchema.optional(),
  deliveredAt: w3DateTimeSchema.optional(),
  releasableAt: w3DateTimeSchema.optional(),
  releasedAt: w3DateTimeSchema.optional(),
  payoutId: w3IdSchema.optional(),
});

export const payDeliveryEventSchema = z.object({
  id: w3IdSchema,
  kind: payDeliveryEventKindSchema,
  occurredAt: w3DateTimeSchema,
  trancheId: w3IdSchema.optional(),
  sourceType: z.string().min(1).max(32),
  /** Goods: carrier and tracking number; credits: credits redeemed. */
  details: z.record(z.string(), z.unknown()),
});

export const payObligationSummarySchema = z.object({
  id: w3IdSchema,
  orderId: w3IdSchema,
  title: z.string().min(1),
  buyer: w3PersonRefSchema.optional(),
  productKind: z.string().min(1).max(64),
  deliveryRule: payDeliveryRuleSchema,
  status: payObligationStatusSchema,
  gross: w3AmountSchema,
  applicationFee: w3AmountSchema,
  tax: w3AmountSchema,
  proceeds: w3AmountSchema,
  released: w3AmountSchema,
  refunded: w3AmountSchema,
  disputed: w3AmountSchema,
  reserved: w3AmountSchema,
  settledAt: w3DateTimeSchema.optional(),
  deliveryStartsAt: w3DateTimeSchema.optional(),
  deliveryEndsAt: w3DateTimeSchema.optional(),
  refundWindowEndsAt: w3DateTimeSchema.optional(),
  shipByAt: w3DateTimeSchema.optional(),
  buyerCancelEligibleAt: w3DateTimeSchema.optional(),
  /** Next date money from this sale becomes payable, if any. */
  nextReleaseAt: w3DateTimeSchema.optional(),
});

export const payObligationRefundSchema = z.object({
  id: w3IdSchema,
  refundRecordId: w3IdSchema,
  source: payRefundSourceSchema,
  amount: w3AmountSchema,
  serviceFeeKept: w3AmountSchema,
  createdAt: w3DateTimeSchema,
});

export const payObligationDetailSchema = payObligationSummarySchema.extend({
  tranches: z.array(payTrancheSchema),
  deliveryEvents: z.array(payDeliveryEventSchema),
  refunds: z.array(payObligationRefundSchema),
  holdIds: z.array(w3IdSchema),
});

export const payObligationsInputSchema = w3PageInputSchema.extend({
  status: payObligationStatusSchema.optional(),
  deliveryRule: payDeliveryRuleSchema.optional(),
});
export const payObligationsPageSchema = w3PageSchema(
  payObligationSummarySchema,
);
export const payObligationInputSchema = z.object({ obligationId: w3IdSchema });

export const payHoldSchema = z.object({
  id: w3IdSchema,
  kind: payHoldKindSchema,
  status: payHoldStatusSchema,
  amount: w3AmountSchema,
  reason: z.string().min(1),
  obligationId: w3IdSchema.optional(),
  reserveId: w3IdSchema.optional(),
  disputeCaseId: w3IdSchema.optional(),
  startsAt: w3DateTimeSchema,
  releaseAfter: w3DateTimeSchema.optional(),
  releasedAt: w3DateTimeSchema.optional(),
});

export const payReserveSchema = z.object({
  id: w3IdSchema,
  kind: payReserveKindSchema,
  trigger: payReserveTriggerSchema,
  status: payReserveStatusSchema,
  percentBps: w3BasisPointsSchema.min(1),
  startsAt: w3DateTimeSchema.optional(),
  endsAt: w3DateTimeSchema.optional(),
  reviewAt: w3DateTimeSchema.optional(),
  noticeReason: z.string().min(1),
  noticeSentAt: w3DateTimeSchema.optional(),
  held: w3AmountSchema,
});
export const payRequestReserveReviewInputSchema = z.object({
  reserveId: w3IdSchema,
  note: z.string().min(1).max(2000),
});

// ── Disputes (DP-Policies, §5.1) ────────────────────────────────────────────

export const payDisputeCaseSchema = z.object({
  id: w3IdSchema,
  obligationId: w3IdSchema.optional(),
  orderId: w3IdSchema.optional(),
  buyer: w3PersonRefSchema.optional(),
  reason: z.string().min(1).max(48),
  status: payDisputeStatusSchema,
  amount: w3AmountSchema,
  fee: w3AmountSchema,
  feeReturned: z.boolean(),
  /** The processor's deadline and the earlier one asked of the club. */
  evidenceDueBy: w3DateTimeSchema.optional(),
  organizationEvidenceDueBy: w3DateTimeSchema.optional(),
  evidenceSubmittedAt: w3DateTimeSchema.optional(),
  openedAt: w3DateTimeSchema,
  closedAt: w3DateTimeSchema.optional(),
});
export const payDisputeDetailSchema = payDisputeCaseSchema.extend({
  /** Storage keys of uploaded files and the written explanation; never card data. */
  evidence: z.object({
    explanation: z.string().max(10_000).optional(),
    files: z.array(
      z.object({
        storageKey: z.string().min(1),
        label: z.string().min(1),
      }),
    ),
  }),
  holdId: w3IdSchema.optional(),
});
export const payDisputesInputSchema = w3PageInputSchema.extend({
  status: payDisputeStatusSchema.optional(),
});
export const payDisputesPageSchema = w3PageSchema(payDisputeCaseSchema);
export const payDisputeInputSchema = z.object({ disputeCaseId: w3IdSchema });
export const paySubmitDisputeEvidenceInputSchema = z.object({
  disputeCaseId: w3IdSchema,
  explanation: z.string().min(1).max(10_000),
  fileStorageKeys: z.array(z.string().min(1)).max(20),
  idempotencyKey: w3IdempotencyKeySchema,
});

export const payRecoverySchema = z.object({
  id: w3IdSchema,
  kind: payRecoveryKindSchema,
  status: payRecoveryStatusSchema,
  amount: w3AmountSchema,
  owedFor: z.string().min(1).max(32),
  dueAt: w3DateTimeSchema.optional(),
  invoiceReference: z.string().optional(),
  collectedAt: w3DateTimeSchema.optional(),
});

// ── Publish gate (DP-Gate) and Money home (MN-Home) ─────────────────────────

export const payPublishGateInputSchema = z.object({
  /** The draft that asked; HQ resumes publishing it after setup. */
  resume: z
    .object({
      kind: z.enum(["offering", "event", "facility"]),
      id: w3IdSchema,
    })
    .optional(),
});
export const payPublishGateSchema = z.object({
  ready: z.boolean(),
  steps: z.array(
    z.object({
      key: z.enum(["business", "verify", "payouts"]),
      label: z.string().min(1),
      state: z.enum(["done", "to-do"]),
      href: z.string().startsWith("/"),
    }),
  ),
  resumeHref: z.string().startsWith("/").optional(),
});

export const payMoneyHomeSchema = z.object({
  accountStatus: payAccountStatusSchema,
  balance: payBalanceSchema,
  thisMonth: z.object({
    gross: w3AmountSchema,
    dunaFees: w3AmountSchema,
    /** Effective platform fee rate shown beside "Duna fees". */
    dunaFeeBps: w3BasisPointsSchema,
    /** Change against last month in basis points; absent without history. */
    changeBps: z.number().int().optional(),
  }),
  openDisputes: z.number().int().nonnegative(),
  activeHolds: z.number().int().nonnegative(),
  recentTransactions: z.array(
    z.object({
      id: w3IdSchema,
      occurredAt: w3DateTimeSchema,
      what: z.string().min(1),
      who: w3PersonRefSchema.optional(),
      amount: w3MoneySchema,
      net: w3MoneySchema,
    }),
  ),
});

export type PayAccount = z.infer<typeof payAccountSchema>;
export type PayObligationDetail = z.infer<typeof payObligationDetailSchema>;
export type PayDisputeDetail = z.infer<typeof payDisputeDetailSchema>;
export type PayPublishGate = z.infer<typeof payPublishGateSchema>;
export type PayMoneyHome = z.infer<typeof payMoneyHomeSchema>;
