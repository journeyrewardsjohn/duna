import { markExpected } from "@duna/observability";
import { TRPCError } from "@trpc/server";

/**
 * The one "not implemented yet" error for W3 stub procedures (W3-0).
 *
 * In demo mode every W3 procedure returns its fixture. Outside demo mode a
 * procedure whose service has not landed throws this. It follows the O1
 * convention for honest "not configured" states: the cause is marked as an
 * expected `provider-not-configured` outcome, so the observed procedure
 * (observability/trpc.ts) answers `PRECONDITION_FAILED` with "This feature is
 * not configured yet.", logs one warning with reason `not-implemented`, and
 * never reports it as a failure. The UI renders that answer with the
 * interaction kit's `NotConfigured` state, never as an error.
 *
 * The owning B package deletes the call when it implements the procedure.
 */
export class NotImplementedYetError extends Error {
  readonly reason = "not-implemented";
  constructor(
    readonly domain: string,
    readonly procedure: string,
  ) {
    super(`${domain}.${procedure} is not implemented yet.`);
    this.name = "NotImplementedYetError";
  }
}

export function notImplementedYet(domain: string, procedure: string): never {
  throw new TRPCError({
    code: "NOT_IMPLEMENTED",
    message: `${domain}.${procedure} is not implemented yet.`,
    cause: markExpected(
      new NotImplementedYetError(domain, procedure),
      "provider-not-configured",
    ),
  });
}

/** True for the error above (server side and in tests). */
export function isNotImplementedYet(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error instanceof NotImplementedYetError ||
      (error as { cause?: unknown }).cause instanceof NotImplementedYetError)
  );
}
