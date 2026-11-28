/**
 * Single-flight actions with no framework in them: the rules behind
 * `useAction` and `useSubmit`, tested once in `submit-core.test.ts`.
 *
 * - One run at a time. A second activation while one is pending is ignored
 *   (double click, double tap, Enter held down), and so is one that lands
 *   within `repeatGuardMs` of a success.
 * - One idempotency key per logical attempt. It is made when the action is
 *   created, reused by every retry after a failure, and replaced only after
 *   a success or an explicit `reset()`. Pass it to the mutation
 *   (`idempotencyKey` on the API's money, message and booking procedures).
 * - Honest states: `pending`, then `success` (held `successHoldMs` so it can
 *   be read) or `error` with field errors and a reference when the error
 *   carries them.
 */
import {
  createIdempotencyKey,
  errorReference,
  type FieldErrors,
  fieldErrorsFrom,
} from "./errors";
import { REPEAT_GUARD_MS, SUCCESS_HOLD_MS } from "./timing";

export type ActionStatus = "idle" | "pending" | "success" | "error";

export interface ActionState<Result> {
  status: ActionStatus;
  /** The last success's result. */
  result: Result | undefined;
  /** The last failure, until the next run. */
  error: unknown;
  /** Server errors mapped to field names, from the last failure. */
  fieldErrors: FieldErrors;
  /** The request id or digest of the last failure, for "Reference: …". */
  reference: string | undefined;
  /** The key for this logical attempt; the same on every retry. */
  idempotencyKey: string;
  /** How many runs this key has had (1 on the first try, 2 on a retry). */
  attempt: number;
}

export interface ActionContext {
  /** Send it with the mutation; the server makes repeats harmless. */
  idempotencyKey: string;
  /** 1 on the first try, more on a retry with the same key. */
  attempt: number;
  /**
   * Aborts when the screen goes away. A mutation the server already
   * received still completes there; this only stops listening.
   */
  signal: AbortSignal;
}

export type ActionOutcome<Result> =
  | { status: "success"; result: Result }
  | { status: "error"; error: unknown }
  /** A second activation while busy, or right after a success. */
  | { status: "ignored" };

export interface ActionOptions<Args extends unknown[], Result> {
  action: (context: ActionContext, ...args: Args) => Promise<Result>;
  /** How long `success` holds before the state returns to `idle`. 0 keeps it. */
  successHoldMs?: number;
  /** Ignore runs this soon after a success. */
  repeatGuardMs?: number;
  /** Makes idempotency keys; a UUID v4 by default. */
  createKey?: () => string;
  /** Maps a failure to field errors; reads the API's shapes by default. */
  mapFieldErrors?: (error: unknown) => FieldErrors | null;
}

export interface SingleFlightAction<Args extends unknown[], Result> {
  run: (...args: Args) => Promise<ActionOutcome<Result>>;
  isPending: () => boolean;
  getState: () => ActionState<Result>;
  /** Starts a new logical attempt: a fresh key, idle state. */
  reset: () => void;
  /** Clears the field error for one field (the person fixed it). */
  clearFieldError: (name: string) => void;
  /**
   * Aborts the current signal and clears timers; call on unmount. The action
   * stays usable (React may mount the same instance again in development).
   */
  dispose: () => void;
}

export function createAction<Args extends unknown[], Result>(
  options: ActionOptions<Args, Result>,
  onChange: (state: ActionState<Result>) => void = () => {},
): SingleFlightAction<Args, Result> {
  const {
    successHoldMs = SUCCESS_HOLD_MS,
    repeatGuardMs = REPEAT_GUARD_MS,
    createKey = createIdempotencyKey,
    mapFieldErrors = fieldErrorsFrom,
  } = options;

  let state: ActionState<Result> = {
    status: "idle",
    result: undefined,
    error: null,
    fieldErrors: {},
    reference: undefined,
    idempotencyKey: createKey(),
    attempt: 0,
  };
  let pending = false;
  let succeededAt = Number.NEGATIVE_INFINITY;
  /** The key was used by a success: the next run is a new attempt. */
  let keySpent = false;
  let hold: ReturnType<typeof setTimeout> | undefined;
  let controller = new AbortController();

  const emit = (patch: Partial<ActionState<Result>>) => {
    state = { ...state, ...patch };
    onChange(state);
  };
  const clearHold = () => {
    if (hold !== undefined) clearTimeout(hold);
    hold = undefined;
  };

  return {
    async run(...args) {
      // Synchronous guard: a second click in the same frame sees `pending`.
      if (pending) return { status: "ignored" };
      if (Date.now() - succeededAt < repeatGuardMs)
        return { status: "ignored" };
      pending = true;
      clearHold();
      if (keySpent) {
        keySpent = false;
        state = { ...state, idempotencyKey: createKey(), attempt: 0 };
      }
      const attempt = state.attempt + 1;
      const idempotencyKey = state.idempotencyKey;
      emit({
        status: "pending",
        error: null,
        fieldErrors: {},
        reference: undefined,
        attempt,
      });
      try {
        const result = await options.action(
          { idempotencyKey, attempt, signal: controller.signal },
          ...args,
        );
        pending = false;
        succeededAt = Date.now();
        keySpent = true;
        emit({ status: "success", result });
        if (successHoldMs > 0) {
          hold = setTimeout(() => {
            hold = undefined;
            if (state.status === "success") emit({ status: "idle" });
          }, successHoldMs);
        }
        return { status: "success", result };
      } catch (error) {
        pending = false;
        emit({
          status: "error",
          error,
          fieldErrors: mapFieldErrors(error) ?? {},
          reference: errorReference(error),
        });
        return { status: "error", error };
      }
    },
    isPending: () => pending,
    getState: () => state,
    reset() {
      if (pending) return;
      clearHold();
      keySpent = false;
      succeededAt = Number.NEGATIVE_INFINITY;
      emit({
        status: "idle",
        result: undefined,
        error: null,
        fieldErrors: {},
        reference: undefined,
        idempotencyKey: createKey(),
        attempt: 0,
      });
    },
    clearFieldError(name) {
      if (!(name in state.fieldErrors)) return;
      emit({
        fieldErrors: Object.fromEntries(
          Object.entries(state.fieldErrors).filter(([key]) => key !== name),
        ),
      });
    },
    dispose() {
      clearHold();
      controller.abort();
      controller = new AbortController();
    },
  };
}
