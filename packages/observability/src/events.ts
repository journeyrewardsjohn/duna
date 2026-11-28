/**
 * Event names follow `domain.action.outcome`: lower camelCase segments, at
 * least three, at most five. Examples: `api.procedure.failed`,
 * `provider.call.succeeded`, `payments.checkout.created`,
 * `ui.boundary.caught`. The outcome is a past-tense word or state
 * (`succeeded`, `failed`, `rejected`, `skipped`, `created`, `caught`).
 */
export const EVENT_NAME_PATTERN =
  /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){2,4}$/;

export function isValidEventName(event: string): boolean {
  return EVENT_NAME_PATTERN.test(event);
}

export type ExpectedErrorKind =
  | "validation"
  | "not-found"
  | "refused"
  | "conflict"
  | "rate-limited"
  | "provider-not-configured";

const expectedMarker = Symbol.for("duna.observability.expected");

/**
 * Thrown when a feature needs an outside provider that has no credentials in
 * this environment. Classified as expected: logged, never reported, and the
 * tRPC layer answers PRECONDITION_FAILED with an honest message.
 */
export class ProviderNotConfiguredError extends Error {
  readonly provider: string;
  constructor(provider: string, label?: string) {
    super(`${label ?? provider} is not configured yet.`);
    this.name = "ProviderNotConfiguredError";
    this.provider = provider;
    (this as unknown as Record<symbol, ExpectedErrorKind>)[expectedMarker] =
      "provider-not-configured";
  }
}

/** Mark any error as expected so it is logged at warn and never reported. */
export function markExpected<T extends object>(
  error: T,
  kind: ExpectedErrorKind,
): T {
  try {
    Object.defineProperty(error, expectedMarker, {
      value: kind,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Frozen errors stay unmarked.
  }
  return error;
}

export function expectedKind(error: unknown): ExpectedErrorKind | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<symbol, unknown>)[expectedMarker];
  return typeof value === "string" ? (value as ExpectedErrorKind) : undefined;
}
