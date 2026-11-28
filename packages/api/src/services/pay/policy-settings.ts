/**
 * Duna Pay policy settings: every number in docs/plan/payout-policy.md that
 * the owner may change. Logic never hard-codes these values; it receives a
 * `PayPolicySettings` object.
 *
 * Source of truth, in order:
 * 1. `DUNA_PAY_POLICY_JSON` (optional, server environment, owner-controlled):
 *    a JSON object with any subset of the keys below. Invalid values are
 *    ignored field by field and reported once, so a typo never stops payouts.
 * 2. `DEFAULT_PAY_POLICY_SETTINGS` (the policy's proposed defaults, each
 *    marked "(owner)" in the policy document).
 *
 * Per-organisation facts (first-payout date, start-tranche opt-in,
 * suspension) live on `organization_pay_accounts`, not here.
 */
import { report } from "@duna/observability";
import { z } from "zod";

export const payPolicySettingsSchema = z.object({
  /** §3: releasable money is paid out within this many business days. */
  payoutBusinessDays: z.number().int().min(1).max(10),
  /** §5.3: first payout no earlier than this many days after the first charge. */
  firstPayoutDelayDays: z.number().int().min(0).max(30),
  /** §4 note A: events up to this many calendar days release at the end of the last day. */
  eventMaxDays: z.number().int().min(1).max(31),
  /** Note B: the largest start tranche an organisation may opt into (basis points). */
  startTrancheMaxBps: z.number().int().min(0).max(2500),
  /** Note B: good standing needed for a start tranche. */
  startTrancheMinPayoutHistoryDays: z.number().int().min(0).max(365),
  startTrancheMaxRefundRateBps: z.number().int().min(0).max(10_000),
  startTrancheMaxDisputeRateBps: z.number().int().min(0).max(10_000),
  /** Note C: memberships release no earlier than settlement + this many business days. */
  membershipMinimumBusinessDays: z.number().int().min(0).max(10),
  /** Note D: Unredeemed Credit Reserve on paid credits (basis points). */
  creditReserveBps: z.number().int().min(0).max(10_000),
  /** Note D: credit packs release on redemption only for this many days after the first charge. */
  creditRedemptionOnlyDays: z.number().int().min(0).max(365),
  /** Note E: ship-by when the organisation states none. */
  goodsDefaultShipDays: z.number().int().min(1).max(90),
  /** §5.1: days the organisation has to send dispute evidence. */
  disputeOrganizationEvidenceDays: z.number().int().min(1).max(21),
  /** §5.4: triggered rolling reserve default and limits. */
  rollingReserveDefaultBps: z.number().int().min(1).max(10_000),
  rollingReserveDefaultDays: z.number().int().min(1).max(180),
  rollingReserveMaxDays: z.number().int().min(1).max(180),
  rollingReserveReviewDays: z.number().int().min(1).max(180),
  /** §5.5: invoice payment terms for an unrecovered negative balance. */
  recoveryInvoiceDays: z.number().int().min(1).max(90),
  /** §5.6: remainder released this many days after closure notice. */
  closureReleaseDays: z.number().int().min(1).max(540),
  /**
   * §6 / terms §9.4: how a refund's cost is split. `pro-rata` is what the
   * refund executor does today; `policy` is the owner's proposed rule
   * (Service Fee kept on player cancellations, processing borne by the club).
   */
  refundFeeRule: z.enum(["pro-rata", "policy"]),
  /** Drift between the processor balance and Duna's records worth reporting. */
  reconciliationDriftToleranceMinor: z.number().int().min(0).max(1_000_000),
  /** §5.4 triggers for proposing a rolling reserve (90-day rates). */
  rollingReserveRefundRateBps: z.number().int().min(0).max(10_000),
  rollingReserveDisputeRateBps: z.number().int().min(0).max(10_000),
  /** §3: schedule written for organisations that have no money settings yet. */
  defaultPayoutInterval: z.enum(["daily", "weekly", "monthly", "manual"]),
});

export type PayPolicySettings = z.infer<typeof payPolicySettingsSchema>;

export const DEFAULT_PAY_POLICY_SETTINGS: PayPolicySettings = Object.freeze({
  payoutBusinessDays: 3,
  firstPayoutDelayDays: 7,
  eventMaxDays: 7,
  startTrancheMaxBps: 2500,
  startTrancheMinPayoutHistoryDays: 90,
  startTrancheMaxRefundRateBps: 500,
  startTrancheMaxDisputeRateBps: 75,
  membershipMinimumBusinessDays: 3,
  creditReserveBps: 2000,
  creditRedemptionOnlyDays: 90,
  goodsDefaultShipDays: 30,
  disputeOrganizationEvidenceDays: 7,
  rollingReserveDefaultBps: 1000,
  rollingReserveDefaultDays: 90,
  rollingReserveMaxDays: 180,
  rollingReserveReviewDays: 30,
  recoveryInvoiceDays: 15,
  closureReleaseDays: 120,
  refundFeeRule: "pro-rata",
  reconciliationDriftToleranceMinor: 100,
  rollingReserveRefundRateBps: 1000,
  rollingReserveDisputeRateBps: 75,
  defaultPayoutInterval: "daily",
});

/**
 * Merge an override object onto the defaults, keeping each valid field and
 * dropping each invalid one. Pure; returns the fields it dropped.
 */
export function mergePayPolicySettings(
  override: unknown,
  base: PayPolicySettings = DEFAULT_PAY_POLICY_SETTINGS,
): { readonly settings: PayPolicySettings; readonly rejected: string[] } {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return { settings: base, rejected: override === undefined ? [] : ["*"] };
  }
  const shape = payPolicySettingsSchema.shape;
  const next: Record<string, unknown> = { ...base };
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(override)) {
    const field = shape[key as keyof typeof shape];
    if (!field) {
      rejected.push(key);
      continue;
    }
    const parsed = field.safeParse(value);
    if (parsed.success) next[key] = parsed.data;
    else rejected.push(key);
  }
  const settings = payPolicySettingsSchema.parse(next);
  if (settings.rollingReserveDefaultDays > settings.rollingReserveMaxDays) {
    return {
      settings: {
        ...settings,
        rollingReserveDefaultDays: settings.rollingReserveMaxDays,
      },
      rejected: [...rejected, "rollingReserveDefaultDays"],
    };
  }
  return { settings, rejected };
}

let cached: { readonly raw: string | undefined; value: PayPolicySettings } = {
  raw: undefined,
  value: DEFAULT_PAY_POLICY_SETTINGS,
};

/** The settings in force for this process (defaults plus the owner's override). */
export function loadPayPolicySettings(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PayPolicySettings {
  const raw = environment.DUNA_PAY_POLICY_JSON;
  if (raw === cached.raw) return cached.value;
  let parsed: unknown;
  try {
    parsed = raw === undefined ? undefined : JSON.parse(raw);
  } catch (error) {
    report(error, {
      event: "pay.settings.invalid",
      fields: { reason: "json-parse" },
    });
    parsed = undefined;
  }
  const merged = mergePayPolicySettings(parsed);
  if (merged.rejected.length) {
    report(new Error("Some Duna Pay policy settings were ignored."), {
      event: "pay.settings.invalid",
      fields: { rejectedKeys: merged.rejected.join(",") },
    });
  }
  cached = { raw, value: merged.settings };
  return merged.settings;
}
