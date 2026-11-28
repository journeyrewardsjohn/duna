"use server";

import { headers } from "next/headers";
import { getAppSession } from "@/components/app-shell/session";
import type { ActionResult } from "@/components/player/action-result";
import {
  acceptDemoInvite,
  DEMO_INVITE_TOKEN,
  demoPlansScope,
  demoWithoutDatabase,
} from "@/components/player/demo";
import { runAction } from "@/components/player/server-action";
import { getServerCaller } from "@/lib/api";

function applicationOrigin(headersValue: Headers): string {
  const protocol = headersValue.get("x-forwarded-proto") ?? "https";
  const host =
    headersValue.get("x-forwarded-host") ??
    headersValue.get("host") ??
    "localhost:3000";
  return `${protocol}://${host}`;
}

/**
 * Accept a court invitation: a place the host paid for is confirmed at once;
 * a share to pay opens secure checkout (`startParticipantShareCheckout`).
 */
export async function startShareCheckoutAction(input: {
  readonly inviteToken: string;
  readonly policyAccepted: boolean;
  readonly policyFullScrollConfirmed: boolean;
  readonly idempotencyKey: string;
}): Promise<
  ActionResult<{
    readonly mode: string;
    readonly checkoutUrl?: string;
    readonly checkoutSessionId?: string;
  }>
> {
  return runAction("web.booking_invite.accept_failed", async () => {
    const session = await getAppSession();
    if (
      demoWithoutDatabase(session.demo) &&
      input.inviteToken === DEMO_INVITE_TOKEN
    ) {
      acceptDemoInvite(input.inviteToken, await demoPlansScope());
      return { mode: "accepted" };
    }
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
    return {
      mode: result.mode,
      ...(result.checkoutUrl ? { checkoutUrl: result.checkoutUrl } : {}),
      ...(result.checkoutSessionId
        ? { checkoutSessionId: result.checkoutSessionId }
        : {}),
    };
  });
}
