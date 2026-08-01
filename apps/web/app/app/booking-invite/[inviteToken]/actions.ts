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

export async function startShareCheckoutAction(input: {
  readonly inviteToken: string;
  readonly policyAccepted: boolean;
  readonly policyFullScrollConfirmed: boolean;
  readonly idempotencyKey: string;
}) {
  try {
    const incoming = await headers();
    const copied = new Headers();
    incoming.forEach((value, key) => copied.set(key, value));
    const origin = applicationOrigin(copied);
    const caller = await getServerCaller();
    const result = await caller.player.startParticipantShareCheckout({
      inviteToken: input.inviteToken,
      policyAccepted: input.policyAccepted,
      policyFullScrollConfirmed: input.policyFullScrollConfirmed,
      successUrl: `${origin}/app/booking-invite/${input.inviteToken}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/app/booking-invite/${input.inviteToken}?checkout=cancelled`,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Your participant checkout could not start.",
    };
  }
}
