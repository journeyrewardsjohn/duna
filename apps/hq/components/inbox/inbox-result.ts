import { report } from "@duna/observability";

/** What an Inbox server action answers: the data, or what went wrong in words. */
export type InboxActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code:
        | "denied"
        | "not-configured"
        | "invalid"
        | "failed"
        /** The review changed since the person read it: review again. */
        | "stale";
      readonly message: string;
      /** The request id the API logged the failure under. */
      readonly reference?: string;
    };

/** An action's failure as an error the interaction kit can show. */
export class InboxActionError extends Error {
  readonly reference?: string;
  readonly code: string;
  /** Read by the kit (`errorMessage`): this message is written for people. */
  readonly userMessage: string;
  constructor(message: string, code: string, reference?: string) {
    super(message);
    this.name = "InboxActionError";
    this.userMessage = message;
    this.code = code;
    this.reference = reference;
  }
}

/** Returns the data, or throws the failure for `useAction` / `useConfirm`. */
export function unwrap<T>(result: InboxActionResult<T>): T {
  if (result.ok) return result.data;
  throw new InboxActionError(result.message, result.code, result.reference);
}

/** Reports only what the kit could not explain (a real failure, not a refusal). */
export function reportFailure(event: string) {
  return (error: unknown) => {
    if (error instanceof InboxActionError && error.code !== "failed") return;
    report(error, { event });
  };
}

export function messageOf(error: unknown, fallback: string): string {
  return (error as { userMessage?: string } | null)?.userMessage ?? fallback;
}
