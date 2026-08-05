"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export async function updatePlayerFollowAction(input: {
  readonly handle: string;
  readonly playerPersonId: string;
  readonly following: boolean;
  readonly notifyRegistrations: boolean;
  readonly notifyWatch: boolean;
  readonly notifyResults: boolean;
}) {
  try {
    const caller = await getServerCaller();
    const state = await caller.player.setPlayerFollow({
      playerPersonId: input.playerPersonId,
      following: input.following,
      notifyRegistrations: input.notifyRegistrations,
      notifyWatch: input.notifyWatch,
      notifyResults: input.notifyResults,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath(`/players/${input.handle}`);
    return { ok: true as const, state };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Your follow preference could not be saved.",
    };
  }
}
