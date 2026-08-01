"use server";

import { getServerCaller } from "@/lib/api";

export async function claimOrganizationInvitationAction(input: {
  readonly inviteToken: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.claimOrganizationInvitation({
      inviteToken: input.inviteToken,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "This invitation could not be accepted.",
    };
  }
}
