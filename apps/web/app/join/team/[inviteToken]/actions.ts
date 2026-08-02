"use server";

import { getServerCaller } from "@/lib/api";

export async function claimTeamInvitationAction(input: {
  readonly inviteToken: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.claimStaffInvitation(input);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "This team invitation could not be accepted.",
    };
  }
}
