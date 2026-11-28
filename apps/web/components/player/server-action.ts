import "server-only";

import { log, report } from "@duna/observability";
import { getServerContext } from "@/lib/api";
import { rateLimitRetryAfterSeconds } from "@/lib/server-read";
import type { ActionResult } from "./action-result";

const REFUSED = new Set([
  "FORBIDDEN",
  "PRECONDITION_FAILED",
  "CONFLICT",
  "NOT_FOUND",
  "UNAUTHORIZED",
]);

/** Zod issues from a BAD_REQUEST as `path: message`. */
function fieldErrors(error: unknown): Record<string, string> | undefined {
  const cause = (error as { cause?: unknown })?.cause as
    | { issues?: readonly { path: readonly PropertyKey[]; message: string }[] }
    | undefined;
  if (!cause?.issues?.length) return undefined;
  const out: Record<string, string> = {};
  for (const issue of cause.issues) {
    const path = issue.path.map(String).join(".");
    if (path && !out[path]) out[path] = issue.message;
  }
  return out;
}

/**
 * Run one server action: its value, or a refusal in words. A budget refusal
 * is expected (a warning, never reported); a refusal the API explains passes
 * its words through; anything else is reported once with a reference.
 */
export async function runAction<T>(
  event: string,
  work: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    const seconds = rateLimitRetryAfterSeconds(error);
    if (seconds !== undefined) {
      log.warn(event, { outcome: "rate_limited" });
      return {
        ok: false,
        busy: true,
        message: `Duna is busy for a moment. Try again in ${Math.max(1, seconds)} second${seconds === 1 ? "" : "s"}.`,
      };
    }
    const code = (error as { code?: unknown })?.code;
    if (code === "BAD_REQUEST") {
      const fields = fieldErrors(error);
      return {
        ok: false,
        message: fields
          ? (Object.values(fields)[0] ?? "Check the highlighted answers.")
          : error instanceof Error
            ? error.message
            : "Check the highlighted answers.",
        ...(fields ? { fieldErrors: fields } : {}),
      };
    }
    if (typeof code === "string" && REFUSED.has(code)) {
      log.info(event, { outcome: "refused", code });
      return {
        ok: false,
        message:
          error instanceof Error && error.message
            ? error.message
            : "Duna couldn’t do that.",
      };
    }
    const { requestId } = await getServerContext();
    const reference = report(error, { event, reference: requestId });
    return {
      ok: false,
      message:
        "That didn’t work on our side. Nothing changed. Try again in a moment.",
      reference,
    };
  }
}
