/** What a Club setup server action answers: the data, or what went wrong in words. */
export type SetupResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code:
        | "denied"
        | "not-configured"
        | "limit"
        | "conflict"
        | "invalid"
        | "failed";
      readonly message: string;
      /** The request id the API logged the failure under. */
      readonly reference?: string;
    };

/** An action's failure as an error the interaction kit can show (message + reference). */
export class SetupActionError extends Error {
  readonly reference?: string;
  readonly code: string;
  /** Read by the kit: this message is written for people. */
  readonly userMessage: string;
  constructor(message: string, code: string, reference?: string) {
    super(message);
    this.name = "SetupActionError";
    this.userMessage = message;
    this.code = code;
    this.reference = reference;
  }
}

/** Returns the data, or throws the failure for `useAction` / `useConfirm` to show. */
export function unwrap<T>(result: SetupResult<T>): T {
  if (result.ok) return result.data;
  throw new SetupActionError(result.message, result.code, result.reference);
}

/** The plain message an action failed with, or the fallback. */
export function failureMessage(error: unknown, fallback: string): string {
  const message = (error as { userMessage?: unknown } | null)?.userMessage;
  return typeof message === "string" && message ? message : fallback;
}
