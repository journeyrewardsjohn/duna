"use server";

import { getServerCaller } from "@/lib/api";

export async function claimMatchParticipantInvitationAction(input: {
  readonly inviteToken: string;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.claimMatchParticipantInvitation({
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
          : "This match invitation could not be accepted.",
    };
  }
}
