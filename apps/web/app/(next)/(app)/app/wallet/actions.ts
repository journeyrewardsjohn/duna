"use server";

import { log, report } from "@duna/observability";
import { getServerCaller } from "@/lib/api";

export type MembershipChange =
  | { readonly ok: true; readonly refundAmountMinor?: number }
  | {
      readonly ok: false;
      readonly message: string;
      readonly reference: string;
    };

/**
 * Cancels (or schedules the end of) a club membership, or resumes one that
 * was set to end. The person confirms first (tier 1, or tier 2 when money
 * comes back); the idempotency key is reused on retry.
 */
export async function changeMembership(input: {
  readonly membershipId: string;
  readonly action: "cancel" | "resume";
  readonly idempotencyKey: string;
}): Promise<MembershipChange> {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.changeOrganizationMembership(input);
    log.info("web.wallet.membership_changed", { action: input.action });
    return {
      ok: true,
      ...(result.refundAmountMinor
        ? { refundAmountMinor: result.refundAmountMinor }
        : {}),
    };
  } catch (error) {
    const reference = report(error, {
      event: "web.wallet.membership_change_failed",
      tags: { action: input.action },
    });
    return {
      ok: false,
      message:
        input.action === "cancel"
          ? "The membership could not be cancelled. Nothing changed."
          : "The membership could not be resumed. Nothing changed.",
      reference,
    };
  }
}
