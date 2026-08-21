export const MEMBERSHIP_SUBSCRIPTION_POLICY_VERSION = "2026-08-18";

export type MembershipSubscriptionPolicy = {
  readonly version: typeof MEMBERSHIP_SUBSCRIPTION_POLICY_VERSION;
  readonly initialTermMonths?: number;
  readonly renewalBehavior: "automatic" | "ends-after-term";
  readonly cancellationTiming: "period-end" | "immediate";
  readonly refundBehavior: "none" | "prorated" | "full-within-window";
  readonly refundWindowDays?: number;
  readonly trialDays: number;
  readonly trialPaymentMethod: "required" | "optional";
  readonly renewalReminderDays: number;
};

export const DEFAULT_MEMBERSHIP_SUBSCRIPTION_POLICY: MembershipSubscriptionPolicy =
  {
    version: MEMBERSHIP_SUBSCRIPTION_POLICY_VERSION,
    renewalBehavior: "automatic",
    cancellationTiming: "period-end",
    refundBehavior: "none",
    trialDays: 0,
    trialPaymentMethod: "required",
    renewalReminderDays: 7,
  };

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

export function membershipSubscriptionPolicy(
  configuration: Readonly<Record<string, unknown>>,
): MembershipSubscriptionPolicy {
  const membership =
    configuration.membership &&
    typeof configuration.membership === "object" &&
    !Array.isArray(configuration.membership)
      ? (configuration.membership as Readonly<Record<string, unknown>>)
      : {};
  const policy =
    membership.subscriptionPolicy &&
    typeof membership.subscriptionPolicy === "object" &&
    !Array.isArray(membership.subscriptionPolicy)
      ? (membership.subscriptionPolicy as Readonly<Record<string, unknown>>)
      : {};
  const initialTermMonths = integerBetween(policy.initialTermMonths, 1, 60);
  const renewalBehavior =
    policy.renewalBehavior === "ends-after-term" && initialTermMonths
      ? "ends-after-term"
      : "automatic";
  const cancellationTiming =
    policy.cancellationTiming === "immediate" ? "immediate" : "period-end";
  const refundBehavior =
    policy.refundBehavior === "prorated" ||
    policy.refundBehavior === "full-within-window"
      ? policy.refundBehavior
      : "none";
  const refundWindowDays =
    refundBehavior === "full-within-window"
      ? (integerBetween(policy.refundWindowDays, 1, 30) ?? 7)
      : undefined;
  return {
    version: MEMBERSHIP_SUBSCRIPTION_POLICY_VERSION,
    initialTermMonths,
    renewalBehavior,
    cancellationTiming,
    refundBehavior,
    refundWindowDays,
    trialDays: integerBetween(policy.trialDays, 0, 90) ?? 0,
    trialPaymentMethod:
      policy.trialPaymentMethod === "optional" ? "optional" : "required",
    renewalReminderDays: integerBetween(policy.renewalReminderDays, 3, 45) ?? 7,
  };
}

export function validateMembershipSubscriptionPolicy(input: {
  readonly policy: MembershipSubscriptionPolicy;
  readonly billingInterval: "month" | "year";
  readonly billingIntervalCount?: number;
}): void {
  const intervalMonths =
    (input.billingInterval === "year" ? 12 : 1) *
    (input.billingIntervalCount ?? 1);
  if (
    input.policy.initialTermMonths &&
    input.policy.initialTermMonths % intervalMonths !== 0
  ) {
    throw new Error(
      `The initial term must be a whole number of ${input.billingInterval} billing periods.`,
    );
  }
  if (
    input.policy.renewalBehavior === "ends-after-term" &&
    !input.policy.initialTermMonths
  ) {
    throw new Error("A membership that ends needs an initial term.");
  }
  if (
    input.policy.cancellationTiming === "period-end" &&
    input.policy.refundBehavior !== "none"
  ) {
    throw new Error(
      "Cancellation refunds require cancellation to take effect immediately.",
    );
  }
}

export function membershipSubscriptionDisclosure(input: {
  readonly organizationName: string;
  readonly priceLabel: string;
  readonly billingInterval: "month" | "year";
  readonly policy: MembershipSubscriptionPolicy;
}): string {
  const { policy } = input;
  const trial =
    policy.trialDays > 0
      ? `Your ${policy.trialDays}-day free trial converts to a paid membership unless you cancel before it ends. `
      : "";
  const term = policy.initialTermMonths
    ? `The initial term is ${policy.initialTermMonths} month${policy.initialTermMonths === 1 ? "" : "s"}. `
    : "";
  const renewal =
    policy.renewalBehavior === "automatic"
      ? `After that, ${input.organizationName} will automatically charge ${input.priceLabel} every ${input.billingInterval} until you cancel. `
      : "The membership ends automatically after the initial term and does not renew. ";
  const cancellation =
    policy.cancellationTiming === "period-end"
      ? "Online cancellation stops future renewal and access continues through the paid period. "
      : "Online cancellation takes effect immediately. ";
  const refund =
    policy.refundBehavior === "prorated"
      ? "The unused portion of the current paid period is refunded to the original payment method."
      : policy.refundBehavior === "full-within-window"
        ? `The latest membership payment is refundable in full within ${policy.refundWindowDays} day${policy.refundWindowDays === 1 ? "" : "s"}; after that, payments are non-refundable.`
        : "Payments already made are non-refundable, except where the law requires otherwise.";
  return `${trial}${term}${renewal}${cancellation}${refund} Manage or cancel online in Duna. Questions: support@duna.coach.`;
}
