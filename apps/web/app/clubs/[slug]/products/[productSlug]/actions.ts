"use server";

import { headers } from "next/headers";
import { getServerCaller } from "@/lib/api";

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
  readonly quantity: number;
  readonly idempotencyKey: string;
}) {
  try {
    const incoming = await headers();
    const requestHeaders = new Headers();
    incoming.forEach((value, key) => requestHeaders.set(key, value));
    const origin = applicationOrigin(requestHeaders);
    const productPath = `/clubs/${input.organizationSlug}/products/${input.productSlug}`;
    const caller = await getServerCaller();
    const result = await caller.player.startCatalogCheckout({
      catalogItemId: input.catalogItemId,
      catalogVariantId: input.catalogVariantId,
      catalogPriceId: input.catalogPriceId,
      paymentMethod: input.paymentMethod,
      quantity: input.quantity,
      successUrl: `${origin}${productPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}${productPath}?checkout=cancelled`,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Checkout could not start.",
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
