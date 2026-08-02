"use server";

import { getServerCaller } from "@/lib/api";

export async function claimGuardianInvitationAction(input: {
  readonly token: string;
  readonly consentConfirmed: true;
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.claimGuardianInvitation(input);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "This guardian invitation could not be accepted.",
    };
  }
}
