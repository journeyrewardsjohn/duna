"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";
import { readPromoCodeFormData } from "./form-data";

export type PromoActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
};

export async function createPromoCodeAction(
  _previous: PromoActionState,
  formData: FormData,
): Promise<PromoActionState> {
  try {
    const { promotion, sourcePromoCodeId } = readPromoCodeFormData(formData);
    const caller = await getServerCaller();
    const created = sourcePromoCodeId
      ? await caller.operator.revisePromoCode({
          ...promotion,
          promoCodeId: sourcePromoCodeId,
          idempotencyKey: crypto.randomUUID(),
        })
      : await caller.operator.createPromoCode({
          ...promotion,
          idempotencyKey: crypto.randomUUID(),
        });
    const revised = "predecessorRetired" in created;
    if (revised && !created.predecessorRetired) {
      return {
        status: "error",
        message: `${created.code} was saved as an inactive revision. The prior code remains live because Stripe sync needs attention.`,
      };
    }
    if (created.stripeSyncStatus === "synced") {
      return {
        status: "success",
        message: revised
          ? `${created.code} is live. The prior code was retired and remains in its version history.`
          : `${created.code} is active and synced to Stripe.`,
      };
    }
    if (created.stripeSyncStatus === "not-applicable") {
      return {
        status: "success",
        message: revised
          ? `${created.code} is live as the next version. The prior code was retired; Stripe is not configured here.`
          : `${created.code} was created, but Stripe is not configured here.`,
      };
    }
    return {
      status: "error",
      message: `${created.code} was created, but Stripe sync needs attention.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Promo code was not created.",
    };
  } finally {
    revalidatePath("/promo-codes");
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
