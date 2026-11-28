import { report } from "@duna/observability";

/** What a People server action answers: the data, or what went wrong in words. */
export type PeopleActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: "denied" | "not-configured" | "invalid" | "failed";
      readonly message: string;
      /** The request id the API logged the failure under. */
      readonly reference?: string;
    };

/** An action's failure as an error the interaction kit can show. */
export class PeopleActionError extends Error {
  readonly reference?: string;
  readonly code: string;
  /** Read by the kit (`errorMessage`): this message is written for people. */
  readonly userMessage: string;
  constructor(message: string, code: string, reference?: string) {
    super(message);
    this.name = "PeopleActionError";
    this.userMessage = message;
    this.code = code;
    this.reference = reference;
  }
}

/** Returns the data, or throws the failure for `useAction` / `useConfirm`. */
export function unwrap<T>(result: PeopleActionResult<T>): T {
  if (result.ok) return result.data;
  throw new PeopleActionError(result.message, result.code, result.reference);
}

/** Reports only what the kit could not explain (a real failure, not a refusal). */
export function reportFailure(event: string) {
  return (error: unknown) => {
    if (error instanceof PeopleActionError && error.code !== "failed") return;
    report(error, { event });
  };
}
