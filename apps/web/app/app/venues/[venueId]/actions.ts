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

export async function startCourtCheckoutAction(input: {
  readonly venueId: string;
  readonly courtId: string;
  readonly localStartsAt: string;
  readonly durationMinutes: number;
  readonly idempotencyKey: string;
}) {
  try {
    const incoming = await headers();
    const requestHeaders = new Headers();
    incoming.forEach((value, key) => requestHeaders.set(key, value));
    const origin = applicationOrigin(requestHeaders);
    const caller = await getServerCaller();
    const result = await caller.player.startCourtCheckout({
      courtId: input.courtId,
      localStartsAt: input.localStartsAt,
      durationMinutes: input.durationMinutes,
      successUrl: `${origin}/app/venues/${input.venueId}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/app/venues/${input.venueId}?checkout=cancelled`,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Court checkout could not start.",
    };
  }
}

export async function courtCheckoutStatusAction(checkoutSessionId: string) {
  try {
    const caller = await getServerCaller();
    const status = await caller.player.courtCheckoutStatus({
      checkoutSessionId,
    });
    return { ok: true as const, status };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Court checkout status is unavailable.",
    };
  }
}
