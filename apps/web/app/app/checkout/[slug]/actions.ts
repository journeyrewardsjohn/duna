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
  readonly ticketTypeId?: string;
  readonly ticketQuantity?: number;
  readonly teamPaymentMode?: "self" | "team";
  readonly teamClaimToken?: string;
  readonly teamRoster?: readonly {
    readonly personId?: string;
    readonly inviteTarget?: string;
    readonly displayName?: string;
  }[];
  readonly subjectPersonId?: string;
  readonly acceptedPolicyIds: readonly string[];
  readonly readPolicyIds: readonly string[];
  readonly isDunaPlus: boolean;
  readonly idempotencyKey: string;
}) {
  try {
    const incoming = await headers();
    const requestHeaders = new Headers();
    incoming.forEach((value, key) => requestHeaders.set(key, value));
    const origin = applicationOrigin(requestHeaders);
    const selectionQuery = input.ticketTypeId
      ? `&ticket=${encodeURIComponent(input.ticketTypeId)}&quantity=${input.ticketQuantity ?? 1}`
      : input.divisionId
        ? `&division=${encodeURIComponent(input.divisionId)}`
        : "";
    const teamQuery = input.teamClaimToken
      ? `&team=${encodeURIComponent(input.teamClaimToken)}`
      : "";
    const participantQuery = input.subjectPersonId
      ? `&participant=${encodeURIComponent(input.subjectPersonId)}`
      : "";
    const caller = await getServerCaller();
    const result = await caller.player.startEventCheckout({
      sessionId: input.sessionId,
      divisionId: input.divisionId,
      ticketTypeId: input.ticketTypeId,
      ticketQuantity: input.ticketQuantity,
      teamPaymentMode: input.teamPaymentMode,
      teamClaimToken: input.teamClaimToken,
      teamRoster: input.teamRoster ? [...input.teamRoster] : undefined,
      subjectPersonId: input.subjectPersonId,
      acceptedPolicyIds: [...input.acceptedPolicyIds],
      readPolicyIds: [...input.readPolicyIds],
      isDunaPlus: input.isDunaPlus,
      successUrl: `${origin}/app/checkout/${input.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}${selectionQuery}${teamQuery}${participantQuery}`,
      cancelUrl: `${origin}/app/checkout/${input.slug}?checkout=cancelled${selectionQuery}${teamQuery}${participantQuery}`,
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

export async function searchTeammatesAction(input: {
  readonly query?: string;
  readonly divisionId?: string;
}) {
  try {
    const caller = await getServerCaller();
    const results = await caller.player.teammateSearch({
      query: input.query,
      divisionId: input.divisionId,
      limit: 12,
    });
    return { ok: true as const, results };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Player search is unavailable.",
    };
  }
}
