export type PromoCodeFormPayload = {
  readonly sourcePromoCodeId?: string;
  readonly promotion: {
    readonly name: string;
    readonly code: string;
    readonly discountType: "percent" | "amount";
    readonly discountValue: number;
    readonly currency: string;
    readonly minimumPurchaseMinor?: number;
    readonly maximumDiscountMinor?: number;
    readonly redemptionCap?: number;
    readonly perPersonLimit?: number;
    readonly startsAt?: string;
    readonly endsAt?: string;
    readonly appliesToAllPlans: boolean;
    readonly appliesToAllProducts: boolean;
    readonly appliesToAllServices: boolean;
    readonly catalogItemIds: string[];
    readonly memberPersonIds: string[];
  };
};

function optionalPositiveInteger(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Add a positive value for ${key}.`);
  }
  return parsed;
}

function optionalMoneyMinor(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Add a positive amount for this field.");
  }
  return Math.round(parsed * 100);
}

function optionalDate(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Choose a valid ${key}.`);
  return date.toISOString();
}

/**
 * Reads the hidden canonical wizard draft. Visible inputs are mounted one
 * stage at a time, so this deliberately never depends on the active step.
 */
export function readPromoCodeFormData(
  formData: FormData,
): PromoCodeFormPayload {
  const submittedDiscountType = formData.get("discountType");
  if (
    submittedDiscountType !== "percent" &&
    submittedDiscountType !== "amount"
  ) {
    throw new Error("Choose percentage or dollar discount.");
  }
  const displayValue = Number(formData.get("discountValue"));
  if (!Number.isFinite(displayValue) || displayValue <= 0) {
    throw new Error("Add a valid discount value.");
  }
  const sourcePromoCodeId = String(
    formData.get("sourcePromoCodeId") ?? "",
  ).trim();
  return {
    sourcePromoCodeId: sourcePromoCodeId || undefined,
    promotion: {
      name: String(formData.get("name") ?? "").trim(),
      code: String(formData.get("code") ?? "").trim(),
      discountType: submittedDiscountType,
      discountValue: Math.round(displayValue * 100),
      currency: String(formData.get("currency") ?? "USD"),
      minimumPurchaseMinor: optionalMoneyMinor(formData, "minimumPurchase"),
      maximumDiscountMinor: optionalMoneyMinor(formData, "maximumDiscount"),
      redemptionCap: optionalPositiveInteger(formData, "redemptionCap"),
      perPersonLimit: optionalPositiveInteger(formData, "perPersonLimit"),
      startsAt: optionalDate(formData, "startsAt"),
      endsAt: optionalDate(formData, "endsAt"),
      appliesToAllPlans: formData.get("appliesToAllPlans") === "on",
      appliesToAllProducts: formData.get("appliesToAllProducts") === "on",
      appliesToAllServices: formData.get("appliesToAllServices") === "on",
      catalogItemIds: formData
        .getAll("catalogItemIds")
        .map(String)
        .filter(Boolean),
      memberPersonIds: formData
        .getAll("memberPersonIds")
        .map(String)
        .filter(Boolean),
    },
  };
}
