export type EntitlementBillingInterval = "week" | "month" | "year";

/**
 * Membership entitlements are authored as monthly promises. A longer prepaid
 * billing period receives the complete promise at the beginning of the paid
 * period instead of waiting for synthetic monthly renewals.
 */
export function membershipEntitlementMultiplier(
  interval: EntitlementBillingInterval | string | null | undefined,
  intervalCount = 1,
): number {
  const count =
    Number.isSafeInteger(intervalCount) && intervalCount > 0
      ? intervalCount
      : 1;
  if (interval === "year") return count * 12;
  if (interval === "month") return count;
  return 1;
}

export function annualPrepayPriceMinor(
  monthlyPriceMinor: number,
  discountPercent: number,
): number {
  if (!Number.isSafeInteger(monthlyPriceMinor) || monthlyPriceMinor < 0) {
    throw new Error("Monthly price must be a non-negative integer.");
  }
  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent >= 100
  ) {
    throw new Error("Annual prepay discount must be between 0% and 99.99%.");
  }
  return Math.round(monthlyPriceMinor * 12 * (1 - discountPercent / 100));
}

export function annualPrepaySavingsPercent(
  monthlyPriceMinor: number,
  annualPriceMinor: number,
): number {
  const fullYearMinor = monthlyPriceMinor * 12;
  if (fullYearMinor <= 0 || annualPriceMinor >= fullYearMinor) return 0;
  return Math.round((1 - annualPriceMinor / fullYearMinor) * 100);
}
