"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export async function requestHqAccountDeletionAction(input: {
  readonly reason?: string;
  readonly forfeitOrganizationCredits: boolean;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.requestAccountDeletion({
      reason: input.reason?.trim() || undefined,
      forfeitOrganizationCredits: input.forfeitOrganizationCredits,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/account");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The deletion request could not be queued.",
    };
  }
}

export async function cancelHqAccountDeletionAction() {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.cancelAccountDeletion({
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/account");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The deletion request could not be cancelled.",
    };
  }
}
