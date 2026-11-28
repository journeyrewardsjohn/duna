/**
 * Observability for `@duna/api`: the tRPC procedure observer, the safe
 * error payload, the client-error endpoint and a provider-call helper typed
 * by the provider registry. See docs/OBSERVABILITY.md.
 */
import type { ProviderKey } from "@duna/core";
import {
  ProviderNotConfiguredError,
  withProviderCall as observeProviderCall,
} from "@duna/observability";

export {
  classifyApiError,
  formatObservedErrorShape,
  observeHttpError,
  observeProcedure,
  safeErrorMessage,
  wasObserved,
  PROVIDER_NOT_CONFIGURED_MESSAGE,
  SAFE_ERROR_MESSAGE,
  type ApiErrorClassification,
} from "./trpc";
export {
  reportRequestError,
  type RequestErrorContextInput,
  type RequestErrorInput,
} from "./next";
export {
  clientErrorBatchSchema,
  clientErrorEventSchema,
  receiveClientErrors,
  CLIENT_ERROR_RATE_LIMIT,
} from "./client-errors";

/**
 * Time and record one call to an outside provider (`providerRegistry` key).
 * Failures are reported with provider and operation, never the payload.
 *
 *   const session = await withProviderCall("stripe", "checkout.sessions.create",
 *     () => stripe.checkout.sessions.create(params, { idempotencyKey }));
 */
export function withProviderCall<T>(
  provider: ProviderKey,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  return observeProviderCall(provider, operation, fn);
}

/** Throw when a provider has no credentials here; clients get PRECONDITION_FAILED. */
export function providerNotConfigured(provider: ProviderKey): never {
  throw new ProviderNotConfiguredError(provider);
}
