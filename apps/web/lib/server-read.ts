import { createEventId, log, report } from "@duna/observability";

/**
 * Server reads for the Player web pages.
 *
 * Every procedure has a per-person budget (packages/api/src/auth.ts
 * `rateLimitMiddleware`). When a page's read is refused with
 * TOO_MANY_REQUESTS during a server render, throwing would take the page to
 * the root error boundary. Instead the read is retried once after the stated
 * delay when that delay is one second or less; if it is refused again (or the
 * delay is longer) the page shows its "busy, try again" state.
 */

/** Seconds the API asked us to wait, when `error` is a rate-limit refusal. */
export function rateLimitRetryAfterSeconds(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ((error as { code?: unknown }).code !== "TOO_MANY_REQUESTS")
    return undefined;
  const message = String((error as { message?: unknown }).message ?? "");
  const seconds = /Retry in (\d+) seconds?/i.exec(message)?.[1];
  return seconds === undefined ? 1 : Number.parseInt(seconds, 10);
}

export function isRateLimited(error: unknown): boolean {
  return rateLimitRetryAfterSeconds(error) !== undefined;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Run a read; when the API refuses it for the per-person budget and asks for
 * one second or less, wait that long and run it once more. Any other failure,
 * or a second refusal, is thrown unchanged.
 */
export async function readWithRateLimitRetry<T>(
  read: () => Promise<T>,
  sleep: (milliseconds: number) => Promise<void> = wait,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const retryAfter = rateLimitRetryAfterSeconds(error);
    if (retryAfter === undefined || retryAfter > 1) throw error;
    await sleep(retryAfter * 1_000);
    return read();
  }
}

export type ServerRead<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      /** The API refused for the per-person budget: "busy, try again". */
      readonly busy: boolean;
      /** The reference the page shows for support. */
      readonly reference: string;
    };

/**
 * A read whose failure the page renders itself instead of throwing. A
 * rate-limit refusal is expected (logged as a warning, never reported); any
 * other failure is reported once. Both carry a reference to show.
 */
export async function settleServerRead<T>(
  read: () => Promise<T>,
  event: string,
  sleep?: (milliseconds: number) => Promise<void>,
): Promise<ServerRead<T>> {
  try {
    return { ok: true, value: await readWithRateLimitRetry(read, sleep) };
  } catch (error) {
    if (isRateLimited(error)) {
      const reference = createEventId();
      log.warn(event, { outcome: "rate_limited", reference });
      return { ok: false, busy: true, reference };
    }
    return { ok: false, busy: false, reference: report(error, { event }) };
  }
}
