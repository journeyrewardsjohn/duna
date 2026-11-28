"use server";

/**
 * The add-a-score flow's server side. The draft token lives only in an
 * HTTP-only cookie (`duna-score-draft`): script on the page never sees it.
 * These actions read the cookie, call the add-score procedures and set or
 * clear the cookie. Every answer is a plain result the page can render:
 * nothing here throws to the client.
 */
import {
  ADD_SCORE_DRAFT_COOKIE,
  type AddScoreClaimPlayer,
  type AddScoreDraftData,
  type AddScoreDraftView,
  type AddScorePreviewResult,
  type AddScoreStep,
} from "@duna/api";
import { log, report } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import { getServerCaller, getServerContext } from "@/lib/api";

export type AddScoreFailure = {
  readonly ok: false;
  readonly kind:
    | "invalid"
    | "rate-limited"
    | "expired"
    | "claimed"
    | "sign-in"
    | "refused"
    | "error";
  readonly message: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly retryAfterSeconds?: number;
  readonly reference?: string;
};

async function token(): Promise<string | undefined> {
  const value = (await cookies()).get(ADD_SCORE_DRAFT_COOKIE)?.value;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

async function rememberToken(value: string, expiresAt: string) {
  (await cookies()).set(ADD_SCORE_DRAFT_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

async function forgetToken() {
  (await cookies()).delete(ADD_SCORE_DRAFT_COOKIE);
}

async function failure(
  error: unknown,
  event: string,
): Promise<AddScoreFailure> {
  if (error instanceof TRPCError) {
    if (error.code === "TOO_MANY_REQUESTS") {
      const seconds = Number(error.message.match(/(\d+) seconds/)?.[1]);
      return {
        ok: false,
        kind: "rate-limited",
        message: error.message,
        retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
      };
    }
    if (error.code === "UNAUTHORIZED") {
      return { ok: false, kind: "sign-in", message: "Sign in to save it." };
    }
    if (error.code === "BAD_REQUEST") {
      return {
        ok: false,
        kind: "invalid",
        message: "Check the highlighted answers.",
        fieldErrors: zodFieldErrors(error),
      };
    }
    if (
      error.code === "FORBIDDEN" ||
      error.code === "PRECONDITION_FAILED" ||
      error.code === "CONFLICT" ||
      error.code === "NOT_FOUND"
    ) {
      return { ok: false, kind: "refused", message: error.message };
    }
  }
  const { requestId } = await getServerContext();
  const reference = report(error, { event, reference: requestId });
  return {
    ok: false,
    kind: "error",
    message: "We couldn’t save that just now. Your answers are still here.",
    reference,
  };
}

/** Zod issues from a BAD_REQUEST as `path: message`. */
function zodFieldErrors(error: TRPCError): Record<string, string> {
  const cause = error.cause as
    | { issues?: readonly { path: readonly PropertyKey[]; message: string }[] }
    | undefined;
  const out: Record<string, string> = {};
  for (const issue of cause?.issues ?? []) {
    const path = issue.path.filter((part) => part !== "data").join(".");
    if (path && !out[path]) out[path] = issue.message;
  }
  return out;
}

export type SaveStepResult =
  { readonly ok: true; readonly draft: AddScoreDraftView } | AddScoreFailure;

/** Save one step. The first save starts the draft and sets the cookie. */
export async function saveAddScoreStep(
  step: AddScoreStep,
  data: AddScoreDraftData,
): Promise<SaveStepResult> {
  try {
    const caller = await getServerCaller();
    const result = await caller.public.addScore.save({
      token: await token(),
      step,
      data,
    });
    if (result.status === "invalid") {
      return {
        ok: false,
        kind: "invalid",
        message: "Check the highlighted answers.",
        fieldErrors: result.fieldErrors,
      };
    }
    if (result.status === "expired") {
      await forgetToken();
      return {
        ok: false,
        kind: "expired",
        message:
          "That score was more than 7 days old, so we deleted it. Start again: it takes a minute.",
      };
    }
    if (result.status === "claimed") {
      await forgetToken();
      return {
        ok: false,
        kind: "claimed",
        message: "That score is already saved to an account.",
      };
    }
    if (result.newToken) {
      await rememberToken(result.newToken, result.draft.expiresAt);
    }
    return { ok: true, draft: result.draft };
  } catch (error) {
    return failure(error, "site.addScore.save.failed");
  }
}

export type PreviewActionResult =
  | { readonly ok: true; readonly result: AddScorePreviewResult }
  | AddScoreFailure;

/** What this result would do (read only). */
export async function previewAddScore(): Promise<PreviewActionResult> {
  const value = await token();
  if (!value) {
    return { ok: true, result: { state: "none" } };
  }
  try {
    const caller = await getServerCaller();
    return {
      ok: true,
      result: await caller.public.addScore.preview({ token: value }),
    };
  } catch (error) {
    return failure(error, "site.addScore.preview.failed");
  }
}

/** Start over: delete the draft and the cookie. */
export async function discardAddScore(): Promise<
  { readonly ok: true } | AddScoreFailure
> {
  const value = await token();
  try {
    if (value) {
      const caller = await getServerCaller();
      await caller.public.addScore.discard({ token: value });
    }
    await forgetToken();
    log.info("site.addScore.discarded");
    return { ok: true };
  } catch (error) {
    return failure(error, "site.addScore.discard.failed");
  }
}

/** The page found an expired draft: drop the cookie that pointed at it. */
export async function forgetExpiredAddScore(): Promise<void> {
  await forgetToken();
}

export type ClaimActionResult =
  { readonly ok: true; readonly matchId: string } | AddScoreFailure;

/** Save the draft to the signed-in person; clears the cookie on success. */
export async function claimAddScore(input: {
  readonly teammates: readonly AddScoreClaimPlayer[];
  readonly opponents: readonly AddScoreClaimPlayer[];
  readonly idempotencyKey: string;
}): Promise<ClaimActionResult> {
  const value = await token();
  if (!value) {
    return {
      ok: false,
      kind: "expired",
      message:
        "We couldn’t find a score from this browser. It may have been deleted after 7 days.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.player.addScore.claim({
      token: value,
      teammates: [...input.teammates],
      opponents: [...input.opponents],
      idempotencyKey: input.idempotencyKey,
    });
    await forgetToken();
    return { ok: true, matchId: result.matchId };
  } catch (error) {
    return failure(error, "site.addScore.claim.failed");
  }
}
