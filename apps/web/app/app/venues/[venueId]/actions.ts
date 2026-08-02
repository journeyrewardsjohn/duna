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
  readonly subjectPersonId?: string;
  readonly localStartsAt: string;
  readonly durationMinutes: number;
  readonly paymentMode: "full" | "split";
  readonly participants: readonly {
    readonly personId?: string;
    readonly name?: string;
    readonly email?: string;
    readonly phoneE164?: string;
  }[];
  readonly policyAccepted: boolean;
  readonly policyFullScrollConfirmed: boolean;
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
      subjectPersonId: input.subjectPersonId,
      localStartsAt: input.localStartsAt,
      durationMinutes: input.durationMinutes,
      paymentMode: input.paymentMode,
      participants: [...input.participants],
      policyAccepted: input.policyAccepted,
      policyFullScrollConfirmed: input.policyFullScrollConfirmed,
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

export async function loadCourtAvailabilityAction(input: {
  readonly venueId: string;
  readonly date: string;
  readonly durationMinutes: number;
}) {
  try {
    const caller = await getServerCaller();
    const availability = await caller.public.courtAvailability(input);
    return { ok: true as const, availability };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Court availability is unavailable.",
    };
  }
}

export async function createAvailabilityAlertAction(input: {
  readonly venueId: string;
  readonly courtId?: string;
  readonly targetDate: string;
  readonly durationMinutes: number;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.createAvailabilityAlert({
      venueId: input.venueId,
      courtId: input.courtId,
      targetDate: input.targetDate,
      durationMinutes: input.durationMinutes,
      earliestMinute: 0,
      latestMinute: 1_440,
      channel: "push",
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The priority alert could not be created.",
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
