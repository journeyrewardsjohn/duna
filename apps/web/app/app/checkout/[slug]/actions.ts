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

export async function startEventCheckoutAction(input: {
  readonly sessionId: string;
  readonly slug: string;
  readonly divisionId?: string;
  readonly subjectPersonId?: string;
  readonly isDunaPlus: boolean;
  readonly idempotencyKey: string;
}) {
  try {
    const incoming = await headers();
    const requestHeaders = new Headers();
    incoming.forEach((value, key) => requestHeaders.set(key, value));
    const origin = applicationOrigin(requestHeaders);
    const caller = await getServerCaller();
    const result = await caller.player.startEventCheckout({
      sessionId: input.sessionId,
      divisionId: input.divisionId,
      subjectPersonId: input.subjectPersonId,
      isDunaPlus: input.isDunaPlus,
      successUrl: `${origin}/app/checkout/${input.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/app/checkout/${input.slug}?checkout=cancelled`,
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

export async function checkoutStatusAction(checkoutSessionId: string) {
  try {
    const caller = await getServerCaller();
    const status = await caller.player.checkoutStatus({ checkoutSessionId });
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
