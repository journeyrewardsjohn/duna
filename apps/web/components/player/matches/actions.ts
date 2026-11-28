"use server";

/**
 * A result's actions, through the existing procedures (`confirmMatch`,
 * `flagMatchHistory`, `removeSelfReportedMatch`), each with the person's own
 * idempotency key. Demo results (no database) answer from the demo store.
 */
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getAppSession, loadDashboard } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";
import type { ActionResult } from "../action-result";
import {
  answerDemoMatch,
  demoMatch,
  demoOpponentOf,
  demoViewerIsOpponent,
  demoWithoutDatabase,
  removeDemoMatch,
} from "../demo";
import { runAction } from "../server-action";

async function demoResult(matchId: string): Promise<boolean> {
  const session = await getAppSession();
  return demoWithoutDatabase(session.demo) && demoMatch(matchId) !== undefined;
}

export async function answerResultAction(input: {
  readonly matchId: string;
  readonly decision: "confirmed" | "disputed";
  readonly reason?: string;
  readonly idempotencyKey: string;
}): Promise<
  ActionResult<{
    readonly status: "pending-verification" | "verified" | "disputed";
    readonly ratingApplied: boolean;
  }>
> {
  return runAction("web.match.answer_failed", async () => {
    if (
      input.decision === "disputed" &&
      (input.reason?.trim().length ?? 0) < 5
    ) {
      throw Object.assign(new Error("A few more words, please."), {
        code: "BAD_REQUEST",
      });
    }
    if (await demoResult(input.matchId)) {
      const viewer = (await demoViewerIsOpponent())
        ? demoOpponentOf(input.matchId)?.id
        : (await loadDashboard()).player.id;
      if (!viewer) throw new Error("This result isn’t yours to confirm.");
      return answerDemoMatch(input.matchId, viewer, input.decision);
    }
    const caller = await getServerCaller();
    const result = await caller.player.confirmMatch({
      matchId: input.matchId,
      decision: input.decision,
      ...(input.decision === "disputed"
        ? { reason: input.reason!.trim() }
        : {}),
      idempotencyKey: input.idempotencyKey,
    });
    log.info("web.match.answered", { decision: input.decision });
    revalidatePath(`/app/matches/${input.matchId}`);
    revalidatePath("/app/matches");
    return result;
  });
}

export async function flagResultAction(input: {
  readonly matchId: string;
  readonly reasonCode:
    "not-me" | "wrong-score" | "wrong-opponents" | "duplicate" | "other";
  readonly details?: string;
  readonly idempotencyKey: string;
}): Promise<ActionResult<{ readonly status: "pending" }>> {
  return runAction("web.match.flag_failed", async () => {
    if (await demoResult(input.matchId)) return { status: "pending" as const };
    const caller = await getServerCaller();
    const result = await caller.player.flagMatchHistory({
      matchId: input.matchId,
      reasonCode: input.reasonCode,
      ...(input.details?.trim() ? { details: input.details.trim() } : {}),
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(`/app/matches/${input.matchId}`);
    return { status: result.status };
  });
}

export async function removeResultAction(input: {
  readonly matchId: string;
  readonly idempotencyKey: string;
}): Promise<ActionResult<{ readonly removed: true }>> {
  return runAction("web.match.remove_failed", async () => {
    if (await demoResult(input.matchId)) {
      removeDemoMatch(input.matchId);
      return { removed: true as const };
    }
    const caller = await getServerCaller();
    await caller.player.removeSelfReportedMatch({
      matchId: input.matchId,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath("/app/matches");
    return { removed: true as const };
  });
}
