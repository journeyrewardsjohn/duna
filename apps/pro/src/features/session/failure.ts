/**
 * How a failed call is shown (participation.md §7: every surface has
 * offline, permission-denied, not-configured and error-with-reference
 * states). Pure apart from `report`, which records the error and returns its
 * reference; offline, denied and not-configured are expected outcomes and
 * are never reported as failures.
 */
import { report } from "@duna/observability";
import { isNetworkFailure } from "../today/use-day";

export type FailureKind = "offline" | "denied" | "not-configured" | "error";

export interface Failure {
  readonly kind: FailureKind;
  /** The error reference (error only). */
  readonly reference?: string;
  /** Duna's own words, when it gave a reason a person can act on. */
  readonly message?: string;
}

/** The tRPC error code, when the error came from Duna. */
export function errorCode(error: unknown): string | undefined {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === "string" ? data.code : undefined;
}

/** Plain-words message Duna sent with a refusal (never a stack or a code). */
export function errorMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : undefined;
  if (!message || message.length > 240 || /[{}<>]|\bat \w+ \(/.test(message))
    return undefined;
  return message;
}

/** Network trouble, a timeout or a server hiccup: worth trying again. */
export function isRetryable(error: unknown): boolean {
  if (isNetworkFailure(error)) return true;
  const code = errorCode(error);
  if (!code) return !(error instanceof Error) || !errorMessage(error);
  return (
    code === "TIMEOUT" ||
    code === "TOO_MANY_REQUESTS" ||
    code === "INTERNAL_SERVER_ERROR" ||
    code === "BAD_GATEWAY" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "GATEWAY_TIMEOUT" ||
    code === "CLIENT_CLOSED_REQUEST"
  );
}

export function classifyFailure(error: unknown, event: string): Failure {
  if (isNetworkFailure(error)) return { kind: "offline" };
  const code = errorCode(error);
  const message = errorMessage(error);
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED")
    return { kind: "denied", ...(message ? { message } : {}) };
  if (code === "PRECONDITION_FAILED" || code === "NOT_IMPLEMENTED")
    return { kind: "not-configured" };
  return {
    kind: "error",
    reference: report(error, { event }),
    ...(message && code && code !== "INTERNAL_SERVER_ERROR" ? { message } : {}),
  };
}
