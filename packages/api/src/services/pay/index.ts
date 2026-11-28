/**
 * Service seam: pay (owner: B2). Duna Pay: the payout policy
 * (docs/plan/payout-policy.md) as obligations, delivery facts, release
 * tranches and payouts. See docs/money/duna-pay.md.
 *
 * - policy-settings.ts: every owner-adjustable number, with defaults.
 * - business-days.ts: the business-day calendar for the payout promise.
 * - delivery-rules.ts: which rule a sold line follows (pure).
 * - release-rules.ts: computeReleasePlan, the policy in one pure function.
 * - obligations.ts: obligations from fund schedules (idempotent).
 * - release-job.ts: delivery sweep and recompute (idempotent, concurrent-safe).
 * - payouts.ts: payouts from releasable tranches; failed payouts return.
 * - read-model.ts: the operator.pay read procedures.
 */
export {
  DEFAULT_PAY_POLICY_SETTINGS,
  loadPayPolicySettings,
  mergePayPolicySettings,
  type PayPolicySettings,
} from "./policy-settings";
export { addBusinessDays, isBusinessDay } from "./business-days";
export { deliveryRuleFor, productKindFor } from "./delivery-rules";
export {
  computeReleasePlan,
  type ReleaseContext,
  type ReleaseEvent,
  type ReleaseObligation,
  type ReleasePlan,
} from "./release-rules";
export { ensurePayObligationsForFund } from "./obligations";
export { runPayReleaseJob, type PayReleaseJobResult } from "./release-job";
export {
  createPayoutFromReleasableTranches,
  returnFailedPayoutTranches,
} from "./payouts";
