"use server";

import { headers } from "next/headers";
import { getServerCaller } from "@/lib/api";
import { catalogCheckoutFailure } from "@/lib/catalog-checkout-error";

function applicationOrigin(headersValue: Headers): string {
  const protocol = headersValue.get("x-forwarded-proto") ?? "https";
  const host =
    headersValue.get("x-forwarded-host") ??
    headersValue.get("host") ??
    "localhost:3000";
  return `${protocol}://${host}`;
}

export async function startCatalogCheckoutAction(input: {
  readonly organizationSlug: string;
  readonly productSlug: string;
  readonly catalogItemId: string;
  readonly catalogVariantId: string;
  readonly catalogPriceId?: string;
  readonly paymentMethod: "card" | "credit" | "cash";
  readonly paymentOption?: "upfront" | "installments";
  readonly quantity: number;
  readonly catalogSessionOccurrenceId?: string;
  readonly recordingConsentAccepted?: boolean;
  readonly idempotencyKey: string;
  readonly returnProductSlug?: string;
  readonly checkoutRole?: "product" | "membership";
  readonly membershipPolicyAccepted?: boolean;
  readonly promoCode?: string;
}) {
  try {
    const incoming = await headers();
    const requestHeaders = new Headers();
    incoming.forEach((value, key) => requestHeaders.set(key, value));
    const origin = applicationOrigin(requestHeaders);
    const productPath = `/clubs/${input.organizationSlug}/products/${input.returnProductSlug ?? input.productSlug}`;
    const membershipStep = input.checkoutRole === "membership";
    const caller = await getServerCaller();
    const result = await caller.player.startCatalogCheckout({
      catalogItemId: input.catalogItemId,
      catalogVariantId: input.catalogVariantId,
      catalogPriceId: input.catalogPriceId,
      paymentMethod: input.paymentMethod,
      paymentOption: input.paymentOption ?? "upfront",
      quantity: input.quantity,
      catalogSessionOccurrenceId: input.catalogSessionOccurrenceId,
      recordingConsentAccepted: input.recordingConsentAccepted,
      successUrl: membershipStep
        ? `${origin}${productPath}?membership_checkout=success&membership_session_id={CHECKOUT_SESSION_ID}`
        : `${origin}${productPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: membershipStep
        ? `${origin}${productPath}?membership_checkout=cancelled`
        : `${origin}${productPath}?checkout=cancelled`,
      idempotencyKey: input.idempotencyKey,
      membershipPolicyAccepted: input.membershipPolicyAccepted,
      promoCode: input.promoCode,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      ...catalogCheckoutFailure(error),
    };
  }
}

export async function catalogOfferEligibilityAction(catalogItemId: string) {
  try {
    const caller = await getServerCaller();
    const eligibility = await caller.player.catalogOfferEligibility({
      catalogItemId,
    });
    return { ok: true as const, eligibility };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Membership status is unavailable.",
    };
  }
}

export async function executeWaiverAction(input: {
  readonly organizationId: string;
  readonly waiverDocumentId: string;
  readonly subjectPersonId: string;
  readonly typedLegalName?: string;
  readonly acknowledgedSectionIds: readonly string[];
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.executeWaiver({
      ...input,
      acknowledgedSectionIds: [...input.acknowledgedSectionIds],
      displayedInline: true,
      scrolledToEnd: true,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The waiver signature could not be recorded.",
    };
  }
}

export async function catalogCheckoutStatusAction(checkoutSessionId: string) {
  try {
    const caller = await getServerCaller();
    const status = await caller.player.catalogCheckoutStatus({
      checkoutSessionId,
    });
    return { ok: true as const, status };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Checkout status is unavailable.",
    };
  }
}
