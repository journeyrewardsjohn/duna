"use server";

import type { ScoreEventEnvelope } from "@duna/api";
import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export async function startMatchAction(input: {
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
  readonly venueId?: string;
  readonly scoringSystem: "rally" | "sideout";
  readonly matchType: "competitive" | "friendly";
  readonly allPlayersAgreedToRecord: true;
  readonly serviceOrder: Readonly<{
    readonly A: readonly string[];
    readonly B: readonly string[];
  }>;
  readonly initialServerPersonId: string;
  readonly deviceId: string;
}) {
  try {
    const caller = await getServerCaller();
    const scoring = await caller.player.startMatch({
      ...input,
      teamAIds: [...input.teamAIds],
      teamBIds: [...input.teamBIds],
      serviceOrder: {
        A: [...input.serviceOrder.A],
        B: [...input.serviceOrder.B],
      },
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

export async function recordCompletedMatchAction(input: {
  readonly teamAIds: readonly string[];
  readonly teamBIds: readonly string[];
  readonly venueId?: string;
  readonly playedAt: string;
  readonly setScores: readonly {
    readonly a: number;
    readonly b: number;
  }[];
  readonly matchType: "competitive" | "friendly";
  readonly allPlayersAgreedToRecord: true;
  readonly deviceId: string;
}) {
  try {
    const caller = await getServerCaller();
    const scoring = await caller.player.recordCompletedMatch({
      ...input,
      teamAIds: [...input.teamAIds],
      teamBIds: [...input.teamBIds],
      setScores: [...input.setScores],
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/matches");
    return { ok: true as const, scoring };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The match result could not be recorded.",
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

export async function flagMatchHistoryAction(input: {
  readonly matchId: string;
  readonly reasonCode:
    "not-me" | "wrong-score" | "wrong-opponents" | "duplicate" | "other";
  readonly details?: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.flagMatchHistory({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/matches");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The match could not be flagged for review.",
    };
  }
}

export async function removeSelfReportedMatchAction(matchId: string) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.removeSelfReportedMatch({
      matchId,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/matches");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The self-reported match could not be removed.",
    };
  }
}
