"use server";

/**
 * Play's actions, each through the existing procedure with the person's own
 * idempotency key (a double press is one request: the kit is single flight
 * and the API replays a repeated key). Each answer is the backend's own words
 * about what came back and when.
 */
import { participationToken, renderParticipationCopy } from "@duna/core";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getAppSession } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";
import type { ActionResult } from "../action-result";
import type { CancelPlan } from "../agenda-model";
import {
  demoPlansScope,
  demoWithoutDatabase,
  isDemoPlanId,
  rememberDemoPlan,
} from "../demo";
import { runAction } from "../server-action";

export interface CancelAnswer {
  /** What came back and when, in the backend's words. */
  readonly message: string;
  readonly creditsReturned?: number;
}

function planId(plan: CancelPlan): string {
  return plan.kind === "pickup" ? plan.pickupSessionId : plan.bookingId;
}

async function demoScopeFor(id: string): Promise<string | null> {
  if (!isDemoPlanId(id)) return null;
  const session = await getAppSession();
  return demoWithoutDatabase(session.demo) ? demoPlansScope() : null;
}

export async function cancelPlanAction(input: {
  readonly plan: CancelPlan;
  /** Demo plans are keyed by the booking id the page showed. */
  readonly demoId?: string;
  readonly idempotencyKey: string;
}): Promise<ActionResult<CancelAnswer>> {
  return runAction("web.play.cancel_failed", async () => {
    const demo = await demoScopeFor(input.demoId ?? planId(input.plan));
    if (demo) {
      rememberDemoPlan(demo, input.demoId ?? planId(input.plan), "gone");
      const plan = input.plan;
      return plan.kind === "catalog" && plan.free
        ? {
            message: `Demo: nothing was changed. ${renderParticipationCopy(
              participationToken("wallet.returned", {
                n: plan.creditsReserved,
              }),
            )}.`,
            creditsReturned: plan.creditsReserved,
          }
        : { message: "Demo: nothing was changed. Your place is cancelled." };
    }
    const caller = await getServerCaller();
    const plan = input.plan;
    let answer: CancelAnswer;
    if (plan.kind === "catalog") {
      const result = await caller.player.cancelCatalogSessionBooking({
        bookingId: plan.bookingId,
        // The confirmation the person pressed is the acknowledgement.
        acknowledgeNoRefund: !plan.free,
        idempotencyKey: input.idempotencyKey,
      });
      answer = {
        message: result.message,
        creditsReturned: result.creditsReturned,
      };
    } else if (plan.kind === "registration") {
      const result = await caller.player.cancelBooking({
        bookingId: plan.bookingId,
        idempotencyKey: input.idempotencyKey,
      });
      answer = { message: result.message };
    } else {
      await caller.player.leavePickup({
        pickupSessionId: plan.pickupSessionId,
        idempotencyKey: input.idempotencyKey,
      });
      answer = { message: "You left the pickup. Your spot is open again." };
    }
    log.info("web.play.cancelled", { kind: plan.kind });
    revalidatePath("/app/play");
    revalidatePath("/app");
    return answer;
  });
}

export async function joinWaitlistAction(input: {
  readonly subjectType: "session" | "pickup-session";
  readonly subjectId: string;
  readonly participantPersonId?: string;
  readonly demoId?: string;
  readonly idempotencyKey: string;
}): Promise<
  ActionResult<{ readonly position: number; readonly status: string }>
> {
  return runAction("web.play.join_waitlist_failed", async () => {
    const demo = input.demoId ? await demoScopeFor(input.demoId) : null;
    if (demo && input.demoId) {
      rememberDemoPlan(demo, input.demoId, "rejoined");
      return { position: 2, status: "waiting" };
    }
    const caller = await getServerCaller();
    const result = await caller.player.participation.joinWaitlist({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      ...(input.participantPersonId
        ? { participantPersonId: input.participantPersonId }
        : {}),
      quantity: 1,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath("/app/play");
    return { position: result.position, status: result.status };
  });
}

export async function createInviteAction(input: {
  readonly subjectType: "session" | "pickup-session";
  readonly subjectId: string;
}): Promise<
  ActionResult<{ readonly url: string; readonly expiresAt: string }>
> {
  return runAction("web.play.invite_failed", async () => {
    const caller = await getServerCaller();
    const link = await caller.player.participation.createInvite({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    });
    return { url: link.url, expiresAt: link.expiresAt };
  });
}

export async function cancelHostedPickupAction(input: {
  readonly pickupSessionId: string;
  readonly idempotencyKey: string;
}): Promise<ActionResult<{ readonly status: "cancelled" }>> {
  return runAction("web.play.cancel_pickup_failed", async () => {
    const caller = await getServerCaller();
    const result = await caller.player.cancelPickup({
      pickupSessionId: input.pickupSessionId,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath("/app/play");
    return { status: result.status };
  });
}
