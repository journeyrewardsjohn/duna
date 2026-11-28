"use server";

import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { isNotConfiguredAnswer } from "@/components/money/money-data";
import type { MoneyActionResult } from "@/components/money/money-action-result";

/**
 * Money's changes (H10). Each one is a person's confirmed action from a
 * Money screen; none moves money by itself. Every call carries the
 * idempotency key the confirming control created (reused on retry), and
 * answers a result instead of throwing, so the dialog can say what happened
 * with the reference support needs.
 */

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Codes whose message is written for people (the API keeps them plain). */
const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

async function run<T>(
  action: string,
  perform: () => Promise<T>,
): Promise<MoneyActionResult<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    revalidatePath("/money", "layout");
    log.info("hq.money.action_succeeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = codeOf(error);
    if (isPermissionDenied(error)) {
      log.info("hq.money.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message: "Only an owner of the club can do this. Nothing was changed.",
        reference: requestId,
      };
    }
    if (isNotConfiguredAnswer(error)) {
      log.info("hq.money.action_not_configured", { action });
      return {
        ok: false,
        code: "not-configured",
        message:
          "This needs Duna Pay connected in this environment, which isn't set up yet. Nothing was changed.",
        reference: requestId,
      };
    }
    log.warn("hq.money.action_failed", { action, code: code ?? "unknown" });
    return {
      ok: false,
      code: "failed",
      message:
        code && plainCodes.has(code) && error instanceof Error && error.message
          ? `${error.message} Nothing was changed.`
          : "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();

/** Pays out what is ready now (the existing manual payout). */
export async function requestPayoutAction(input: {
  readonly idempotencyKey: string;
}) {
  return run("requestPayout", async () => {
    const caller = await getServerCaller();
    return caller.operator.createManualPayout({
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/** Opens identity verification: the hosted link the backend returns. */
export async function startOnboardingAction() {
  return run("startOnboarding", async () => {
    const caller = await getServerCaller();
    return caller.operator.pay.startOnboarding({
      method: "hosted",
      returnPath: "/money/duna-pay?stripe=return",
    });
  });
}

export async function updateBusinessAction(input: {
  readonly businessType: string;
  readonly whatYouSell: string;
}) {
  return run("updateBusiness", async () => {
    const caller = await getServerCaller();
    await caller.operator.pay.updateBusiness({
      businessType: input.businessType,
      whatYouSell: input.whatYouSell.trim(),
    });
    return { saved: true } as const;
  });
}

export async function updatePayoutSettingsAction(input: {
  readonly interval: "manual" | "daily" | "weekly" | "monthly";
  readonly weeklyDay:
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
  readonly monthlyDay: number;
  readonly minimumPayoutMinor: number;
  readonly currency: string;
  readonly statementDescriptor?: string;
  readonly payoutStatementDescriptor?: string;
}) {
  return run("updatePayoutSettings", async () => {
    const caller = await getServerCaller();
    return caller.operator.pay.updatePayoutSettings({
      interval: input.interval,
      weeklyDay: input.weeklyDay,
      monthlyDay: input.monthlyDay,
      minimumPayout: {
        amountMinor: input.minimumPayoutMinor,
        currency: input.currency as "USD",
      },
      statementDescriptor: input.statementDescriptor || undefined,
      payoutStatementDescriptor: input.payoutStatementDescriptor || undefined,
    });
  });
}

/** Refunds part or all of an order to the card, or restores its credits. */
export async function refundOrderAction(input: {
  readonly orderId: string;
  readonly amountMinor: number;
  readonly method: "card" | "credits";
  readonly credits?: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}) {
  return run("refundOrder", async () => {
    const caller = await getServerCaller();
    return caller.operator.refundOrganizationOrder({
      orderId: input.orderId,
      amountMinor: input.method === "credits" ? 0 : input.amountMinor,
      disposition:
        input.method === "credits" ? "organization-credit" : "original-payment",
      credits: input.method === "credits" ? input.credits : undefined,
      reason: input.reason,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/** Sends the club's written response on a dispute. */
export async function submitDisputeResponseAction(input: {
  readonly disputeCaseId: string;
  readonly explanation: string;
  readonly idempotencyKey: string;
}) {
  return run("submitDisputeEvidence", async () => {
    const caller = await getServerCaller();
    return caller.operator.pay.submitDisputeEvidence({
      disputeCaseId: input.disputeCaseId,
      explanation: input.explanation,
      fileStorageKeys: [],
      idempotencyKey: input.idempotencyKey,
    });
  });
}

/** Asks Duna to review a reserve (the club may ask at any time). */
export async function requestReserveReviewAction(input: {
  readonly reserveId: string;
  readonly note: string;
}) {
  return run("requestReserveReview", async () => {
    const caller = await getServerCaller();
    return caller.operator.pay.requestReserveReview({
      reserveId: input.reserveId,
      note: input.note,
    });
  });
}

/** Adds a refund policy (the existing policy service; versions are kept). */
export async function createRefundPolicyAction(input: {
  readonly name: string;
  readonly mode: "refundable" | "non-refundable";
  readonly refundBeforeHours?: number;
  readonly terms: string;
  readonly makeDefault: boolean;
  readonly idempotencyKey: string;
}) {
  return run("createRefundPolicy", async () => {
    const caller = await getServerCaller();
    return caller.operator.createRefundPolicy({
      name: input.name,
      mode: input.mode,
      refundBeforeMinutes:
        input.mode === "refundable" && input.refundBeforeHours !== undefined
          ? Math.round(input.refundBeforeHours * 60)
          : undefined,
      terms: input.terms,
      makeDefault: input.makeDefault,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}
