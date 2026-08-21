"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export type PromoActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
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
    throw new Error(`Add a positive amount for ${key}.`);
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

export async function createPromoCodeAction(
  _previous: PromoActionState,
  formData: FormData,
): Promise<PromoActionState> {
  try {
    const discountType = formData.get("discountType");
    if (discountType !== "percent" && discountType !== "amount") {
      throw new Error("Choose percentage or dollar discount.");
    }
    const displayValue = Number(formData.get("discountValue"));
    if (!Number.isFinite(displayValue) || displayValue <= 0) {
      throw new Error("Add a valid discount value.");
    }
    const caller = await getServerCaller();
    const created = await caller.operator.createPromoCode({
      name: String(formData.get("name") ?? "").trim(),
      code: String(formData.get("code") ?? "").trim(),
      discountType,
      discountValue:
        discountType === "percent"
          ? Math.round(displayValue * 100)
          : Math.round(displayValue * 100),
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
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/promo-codes");
    return {
      status: created.stripeSyncStatus === "synced" ? "success" : "error",
      message:
        created.stripeSyncStatus === "synced"
          ? `${created.code} is active and synced to Stripe.`
          : created.stripeSyncStatus === "not-applicable"
            ? `${created.code} was created, but Stripe is not configured here.`
            : `${created.code} was created, but Stripe sync needs attention.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Promo code was not created.",
    };
  }
}

export async function deactivatePromoCodeAction(formData: FormData) {
  const caller = await getServerCaller();
  await caller.operator.deactivatePromoCode({
    promoCodeId: String(formData.get("promoCodeId")),
    idempotencyKey: crypto.randomUUID(),
  });
  revalidatePath("/promo-codes");
}

export async function duplicatePromoCodeAction(formData: FormData) {
  const caller = await getServerCaller();
  await caller.operator.duplicatePromoCode({
    promoCodeId: String(formData.get("promoCodeId")),
    code: String(formData.get("code") ?? "").trim(),
    idempotencyKey: crypto.randomUUID(),
  });
  revalidatePath("/promo-codes");
}
