/**
 * tRPC observability: one log line per procedure call, error classification,
 * reporting of unexpected failures only, and the safe error payload clients
 * receive. Wired in `../auth.ts` (base procedure + error formatter) so every
 * procedure built from `publicProcedure`, `protectedProcedure`,
 * `organizationProcedure`, `adminProcedure` or `superAdminProcedure` is
 * observed. The procedure input is never logged.
 */
import {
  expectedKind,
  log,
  report,
  reportedReference,
  wasReported,
  type ExpectedErrorKind,
} from "@duna/observability";
import { runWithLogContext } from "@duna/observability/server";
import { TRPCError } from "@trpc/server";
import type { ApiContext } from "../context";

export type ApiErrorClassification =
  | {
      readonly expected: true;
      readonly kind: ExpectedErrorKind;
      readonly reason?: string;
    }
  | { readonly expected: false };

type TrpcCode = TRPCError["code"];

const expectedByCode: Partial<Record<TrpcCode, ExpectedErrorKind>> = {
  PARSE_ERROR: "validation",
  BAD_REQUEST: "validation",
  UNPROCESSABLE_CONTENT: "validation",
  PAYLOAD_TOO_LARGE: "validation",
  METHOD_NOT_SUPPORTED: "validation",
  UNSUPPORTED_MEDIA_TYPE: "validation",
  NOT_FOUND: "not-found",
  UNAUTHORIZED: "refused",
  FORBIDDEN: "refused",
  PAYMENT_REQUIRED: "refused",
  PRECONDITION_FAILED: "refused",
  PRECONDITION_REQUIRED: "refused",
  CONFLICT: "conflict",
  CLIENT_CLOSED_REQUEST: "conflict",
  TOO_MANY_REQUESTS: "rate-limited",
};

const reasonPattern = /^[a-z][a-zA-Z0-9_.-]{0,63}$/;

/** A refusal's machine-readable reason (health policy, provider key), never its prose. */
function reasonOf(error: TRPCError): string | undefined {
  const cause = error.cause as
    | { healthReason?: unknown; reason?: unknown; provider?: unknown }
    | undefined;
  for (const candidate of [
    cause?.healthReason,
    cause?.reason,
    cause?.provider,
  ]) {
    if (typeof candidate === "string" && reasonPattern.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function classifyApiError(error: TRPCError): ApiErrorClassification {
  const marked = expectedKind(error.cause) ?? expectedKind(error);
  if (marked) return { expected: true, kind: marked, reason: reasonOf(error) };
  // Services that need the connected database say so with this code; in demo
  // mode and unconfigured previews that is an honest "not configured" state.
  if (
    (error.cause as { code?: unknown } | undefined)?.code ===
    "DATABASE_REQUIRED"
  ) {
    return {
      expected: true,
      kind: "provider-not-configured",
      reason: "database",
    };
  }
  const byCode = expectedByCode[error.code];
  if (byCode) return { expected: true, kind: byCode, reason: reasonOf(error) };
  return { expected: false };
}

export const SAFE_ERROR_MESSAGE = "Something went wrong on our side.";
export const PROVIDER_NOT_CONFIGURED_MESSAGE =
  "This feature is not configured yet.";

export function safeErrorMessage(requestId: string | undefined): string {
  return requestId
    ? `${SAFE_ERROR_MESSAGE} Reference: ${requestId}`
    : SAFE_ERROR_MESSAGE;
}

const observedErrors = new WeakSet<object>();

/** True once the procedure middleware has logged this error. */
export function wasObserved(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && observedErrors.has(error)
  );
}

function now(): number {
  return performance.now();
}

interface ProcedureCall<R> {
  readonly ctx: ApiContext;
  readonly path: string;
  readonly type: string;
  readonly next: () => Promise<R>;
}

/**
 * The procedure middleware body. Runs the rest of the chain inside the
 * request's log context, then writes `api.procedure.succeeded` (info) or
 * `api.procedure.failed` (warn when expected, error when unexpected) and
 * reports unexpected failures once.
 */
export async function observeProcedure<
  R extends { ok: true } | { ok: false; error: TRPCError },
>({ ctx, path, type, next }: ProcedureCall<R>): Promise<R> {
  const context = {
    requestId: ctx.requestId,
    actorId: ctx.actor?.personId,
    organizationId: ctx.actor?.organizationId,
  };
  return runWithLogContext(context, async () => {
    const started = now();
    let result: R;
    try {
      result = await next();
    } catch (cause) {
      // tRPC returns failures as results; this is a defensive path.
      result = {
        ok: false,
        error:
          cause instanceof TRPCError
            ? cause
            : new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause }),
      } as R;
    }
    const durationMs = Math.round(now() - started);
    if (result.ok) {
      log.info("api.procedure.succeeded", {
        path,
        type,
        code: "OK",
        durationMs,
      });
      return result;
    }
    let error = (result as { error: TRPCError }).error;
    if (expectedKind(error.cause) === "provider-not-configured") {
      error = new TRPCError({
        code: "PRECONDITION_FAILED",
        message: PROVIDER_NOT_CONFIGURED_MESSAGE,
        cause: error.cause,
      });
      result = { ...result, error } as R;
    }
    observedErrors.add(error);
    const classification = classifyApiError(error);
    if (classification.expected) {
      log.warn("api.procedure.failed", {
        path,
        type,
        code: error.code,
        durationMs,
        classification: classification.kind,
        reason: classification.reason,
      });
      return result;
    }
    const alreadyReported = wasReported(error.cause) || wasReported(error);
    const reference = alreadyReported
      ? (reportedReference(error.cause) ?? reportedReference(error))
      : report(error.cause ?? error, {
          event: "api.procedure.failed",
          fields: { type, code: error.code, durationMs },
          tags: { path, classification: "unexpected" },
          reference: ctx.requestId,
        });
    if (alreadyReported) {
      log.error("api.procedure.failed", {
        path,
        type,
        code: error.code,
        durationMs,
        classification: "unexpected",
        reference,
      });
    }
    return result;
  });
}

/**
 * For the HTTP adapter's `onError`: log failures the procedure middleware
 * never saw (unknown procedure path, context creation, request parsing).
 */
export function observeHttpError(input: {
  readonly error: TRPCError;
  readonly path?: string;
  readonly type?: string;
  readonly requestId?: string;
}): void {
  if (wasObserved(input.error)) return;
  const classification = classifyApiError(input.error);
  if (classification.expected) {
    log.warn("api.request.failed", {
      path: input.path,
      type: input.type,
      code: input.error.code,
      classification: classification.kind,
      requestId: input.requestId,
    });
    return;
  }
  report(input.error.cause ?? input.error, {
    event: "api.request.failed",
    fields: { type: input.type, code: input.error.code },
    tags: { path: input.path ?? "unknown", classification: "unexpected" },
    reference: input.requestId,
  });
}

/**
 * The error formatter body: every error payload carries `data.requestId`;
 * unexpected failures get a safe message with the reference instead of the
 * internal message. Expected failures keep their written-for-people message.
 */
export function formatObservedErrorShape<
  S extends { message: string; data: object },
>(shape: S, error: TRPCError, ctx: ApiContext | undefined): S {
  const requestId = ctx?.requestId;
  const classification = classifyApiError(error);
  const data: Record<string, unknown> = {
    ...shape.data,
    ...(requestId ? { requestId } : {}),
  };
  // tRPC adds the server stack outside production; only local development
  // keeps it (previews and tests behave like production).
  if (process.env.NODE_ENV !== "development") delete data.stack;
  return {
    ...shape,
    message: classification.expected
      ? shape.message
      : safeErrorMessage(requestId),
    data,
  };
}
