"use server";

import type { ScoreEventEnvelope } from "@duna/api";
import { getServerCaller } from "@/lib/api";

export async function startMatchAction(input: {
  readonly teamAIds: readonly [string, string];
  readonly teamBIds: readonly [string, string];
  readonly venueId?: string;
  readonly scoringSystem: "rally" | "sideout";
  readonly initialServer: "A" | "B";
  readonly deviceId: string;
}) {
  try {
    const caller = await getServerCaller();
    const scoring = await caller.player.startMatch({
      ...input,
      teamAIds: [...input.teamAIds],
      teamBIds: [...input.teamBIds],
      idempotencyKey: crypto.randomUUID(),
    });
    return { ok: true as const, scoring };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "The match could not start.",
    };
  }
}

export async function appendMatchEventsAction(input: {
  readonly matchId: string;
  readonly deviceId: string;
  readonly events: readonly ScoreEventEnvelope[];
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.appendMatchEvents({
      matchId: input.matchId,
      deviceId: input.deviceId,
      events: [...input.events],
      idempotencyKey: crypto.randomUUID(),
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Score events could not be synchronized.",
    };
  }
}

export async function confirmMatchAction(input: {
  readonly matchId: string;
  readonly decision: "confirmed" | "disputed";
  readonly reason?: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.confirmMatch({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The match response could not be recorded.",
    };
  }
}
