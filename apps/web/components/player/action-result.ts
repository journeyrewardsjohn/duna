/**
 * What a Player page's server action answers: the value, or why not in
 * plain words (with a reference for anything unexpected). Server actions
 * never throw to the client; the client turns a refusal into an error the
 * kit's `useConfirm` / `useAction` show (they read `reference`).
 */
export type ActionResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly message: string;
      /** Asked to slow down (the per-person budget). */
      readonly busy?: boolean;
      readonly reference?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

export class ActionError extends Error {
  readonly reference?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  constructor(
    message: string,
    options: {
      readonly reference?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    } = {},
  ) {
    super(message);
    this.name = "ActionError";
    if (options.reference) this.reference = options.reference;
    if (options.fieldErrors) this.fieldErrors = options.fieldErrors;
  }
}

/** The value, or an `ActionError` carrying the words and the reference. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.value;
  throw new ActionError(result.message, {
    ...(result.reference ? { reference: result.reference } : {}),
    ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
  });
}
