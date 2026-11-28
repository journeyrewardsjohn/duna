/** What a Money server action answers: the data, or what went wrong in words. */
export type MoneyActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: "denied" | "not-configured" | "failed";
      readonly message: string;
      /** The request id the API logged the failure under. */
      readonly reference?: string;
    };

/** An action's failure as an error the interaction kit can show (message + reference). */
export class MoneyActionError extends Error {
  readonly reference?: string;
  readonly code: string;
  /** Read by the kit (`errorMessage`): this message is written for people. */
  readonly userMessage: string;
  constructor(message: string, code: string, reference?: string) {
    super(message);
    this.name = "MoneyActionError";
    this.userMessage = message;
    this.code = code;
    this.reference = reference;
  }
}

/** Returns the data, or throws the failure for `useAction` / `useConfirm` to show. */
export function unwrap<T>(result: MoneyActionResult<T>): T {
  if (result.ok) return result.data;
  throw new MoneyActionError(result.message, result.code, result.reference);
}
