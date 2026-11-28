/**
 * `withProviderCall(provider, operation, fn)`: time an outbound call to an
 * outside provider and record its outcome. The payload never enters this
 * helper: `fn` closes over it.
 *
 * - success: `provider.call.succeeded` (info) with provider, operation, durationMs
 * - the provider refused the request (HTTP 4xx other than 401/403/429, for
 *   example a declined card): `provider.call.rejected` (warn), not reported
 * - anything else (5xx, network, timeout, bad credentials, rate limited,
 *   unexpected exception): `provider.call.failed`, reported once
 *
 * The error is rethrown unchanged so callers keep their own handling.
 */
import { expectedKind } from "./events";
import { log } from "./logger";
import { report } from "./reporter";

function now(): number {
  const performance = (globalThis as { performance?: { now(): number } })
    .performance;
  return performance ? performance.now() : Date.now();
}

function httpStatusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const candidate =
    typeof record.statusCode === "number"
      ? record.statusCode
      : typeof record.status === "number"
        ? record.status
        : typeof record.response?.status === "number"
          ? record.response.status
          : undefined;
  return typeof candidate === "number" &&
    Number.isInteger(candidate) &&
    candidate >= 100 &&
    candidate < 600
    ? candidate
    : undefined;
}

export type ProviderCallOutcome = "succeeded" | "rejected" | "failed";

export function classifyProviderFailure(error: unknown): ProviderCallOutcome {
  if (expectedKind(error)) return "rejected";
  const status = httpStatusOf(error);
  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 401 &&
    status !== 403 &&
    status !== 429
  ) {
    return "rejected";
  }
  return "failed";
}

export async function withProviderCall<T>(
  provider: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = now();
  try {
    const result = await fn();
    log.info("provider.call.succeeded", {
      provider,
      operation,
      durationMs: Math.round(now() - started),
    });
    return result;
  } catch (error) {
    const durationMs = Math.round(now() - started);
    const outcome = classifyProviderFailure(error);
    const httpStatus = httpStatusOf(error);
    if (outcome === "rejected") {
      log.warn("provider.call.rejected", {
        provider,
        operation,
        durationMs,
        httpStatus,
        errorName: error instanceof Error ? error.name : "NonError",
      });
    } else {
      report(error, {
        event: "provider.call.failed",
        fields: { durationMs, httpStatus },
        tags: { provider, operation },
      });
    }
    throw error;
  }
}
