"use server";

import { getServerCaller } from "@/lib/api";

export async function changeOrganizationMembershipAction(input: {
  readonly membershipId: string;
  readonly action: "cancel" | "resume";
  readonly idempotencyKey: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.changeOrganizationMembership(input);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The membership could not be updated.",
    };
  }
}
