"use server";

import { getServerCaller } from "@/lib/api";

export async function refreshLiveMatchAction(matchId: string) {
  try {
    const caller = await getServerCaller();
    const match = await caller.public.liveMatch({ matchId });
    return { ok: true as const, match };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Live score is unavailable.",
    };
  }
}
