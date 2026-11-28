"use client";

/**
 * The interaction kit's React hooks. Each is a thin wrapper over a tested
 * core in this folder (`submit-core.ts`, `latest-core.ts`,
 * `autosave-core.ts`, `debouncer.ts`); the rules live there.
 */
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { errorToast, successToast } from "../toast/notify";
import {
  type Autosave,
  type AutosaveState,
  createAutosave,
} from "./autosave-core";
import { createThrottler, type ThrottleOptions } from "./debouncer";
import type { DebouncedCallback } from "./debounce";
import { errorMessage, type FieldErrors } from "./errors";
import { createLatest, type LatestResult } from "./latest-core";
import { useDelayedLoading } from "./interactions";
import {
  type ActionContext,
  type ActionOptions,
  type ActionOutcome,
  type ActionState,
  createAction,
} from "./submit-core";
import { AUTOSAVE_DELAY_MS, THROTTLE_MS } from "./timing";

/** Keeps a ref pointing at the newest value without re-running effects. */
function useLatestRef<Value>(value: Value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

export interface ActionMessages<Args extends unknown[], Result> {
  /** Toast on success, naming what happened ("Practice cancelled"). */
  success?: string | ((result: Result, ...args: Args) => string);
  /**
   * Toast on failure, in plain words. With a reference on the error, the
   * toast shows "Reference: …" and stays until dismissed.
   */
  error?: string | ((error: unknown, ...args: Args) => string);
}

export interface OptimisticUpdate<Args extends unknown[]> {
  /** Shows the change now; returns how to put it back. */
  apply: (...args: Args) => () => void;
}

export interface UseActionOptions<Args extends unknown[], Result> extends Omit<
  ActionOptions<Args, Result>,
  "action"
> {
  messages?: ActionMessages<Args, Result>;
  /**
   * Apply the change on screen before the server answers, and roll it back
   * (with `messages.error`) if it fails. Never for money, sends or anything
   * another person sees first.
   */
  optimistic?: OptimisticUpdate<Args>;
  /** Called with the report-worthy error, for `report()` from the observability package. */
  report?: (error: unknown) => void;
  onSuccess?: (result: Result, ...args: Args) => void;
  onError?: (error: unknown, ...args: Args) => void;
}

export interface UseAction<
  Args extends unknown[],
  Result,
> extends ActionState<Result> {
  /** Runs the action once; a second activation while busy is ignored. */
  run: (...args: Args) => Promise<ActionOutcome<Result>>;
  pending: boolean;
  /** Whether to draw progress: false for work under 250 ms, then shown at least 400 ms. */
  showPending: boolean;
  reset: () => void;
  clearFieldError: (name: string) => void;
  /**
   * Spread on a Tideline `Button` that runs the action with no arguments:
   * loading state (`aria-busy`, presses ignored) and a guard against a held
   * Enter key.
   */
  buttonProps: {
    loading: boolean;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
  };
}

const say = <Args extends unknown[], Value>(
  message: string | ((value: Value, ...args: Args) => string) | undefined,
  value: Value,
  args: Args,
) => (typeof message === "function" ? message(value, ...args) : message);

/** Stops a held Enter or Space from pressing again and again. */
export function preventKeyRepeat(event: KeyboardEvent) {
  if (event.repeat && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
  }
}

/**
 * Runs an async action with single-flight protection, an idempotency key per
 * logical attempt, honest pending / success / error states, optional
 * optimistic update with rollback, and toasts that name the result.
 *
 *   const cancel = useAction(
 *     ({ idempotencyKey }) => api.practice.cancel.mutate({ id, idempotencyKey }),
 *     { messages: { success: "Practice cancelled", error: "Could not cancel the practice." } },
 *   );
 *   <Button {...cancel.buttonProps}>Cancel practice</Button>
 */
export function useAction<Args extends unknown[], Result>(
  action: (context: ActionContext, ...args: Args) => Promise<Result>,
  options: UseActionOptions<Args, Result> = {},
): UseAction<Args, Result> {
  const latest = useLatestRef({ action, options });
  const { successHoldMs, repeatGuardMs } = options;
  const [state, setState] = useState<ActionState<Result> | null>(null);

  const core = useMemo(
    () =>
      createAction<Args, Result>(
        {
          successHoldMs,
          repeatGuardMs,
          createKey: latest.current.options.createKey,
          mapFieldErrors: latest.current.options.mapFieldErrors,
          action: async (context, ...args) => {
            const current = latest.current;
            const rollback = current.options.optimistic?.apply(...args);
            try {
              return await current.action(context, ...args);
            } catch (error) {
              rollback?.();
              throw error;
            }
          },
        },
        setState,
      ),
    // The core holds the idempotency key: keep it for the component's life.
    [successHoldMs, repeatGuardMs],
  );
  useEffect(() => () => core.dispose(), [core]);

  const run = useCallback(
    async (...args: Args) => {
      const outcome = await core.run(...args);
      const { options: current } = latest.current;
      if (outcome.status === "success") {
        const message = say(current.messages?.success, outcome.result, args);
        if (message) successToast(message);
        current.onSuccess?.(outcome.result, ...args);
      } else if (outcome.status === "error") {
        current.report?.(outcome.error);
        const fallback = say(current.messages?.error, outcome.error, args);
        if (fallback) {
          errorToast(errorMessage(outcome.error, fallback), {
            reference: core.getState().reference,
          });
        }
        current.onError?.(outcome.error, ...args);
      }
      return outcome;
    },
    [core, latest],
  );

  const current = state ?? core.getState();
  const pending = current.status === "pending";
  const showPending = useDelayedLoading(pending);

  return {
    ...current,
    run,
    pending,
    showPending,
    reset: core.reset,
    clearFieldError: core.clearFieldError,
    buttonProps: {
      loading: pending,
      onClick: () => {
        void run(...([] as unknown as Args));
      },
      onKeyDown: preventKeyRepeat,
    },
  };
}

export type FormValues = Record<string, string>;

/** Every named control's value, as text (files and repeated names: the first). */
export function readFormValues(form: HTMLFormElement): FormValues {
  const values: FormValues = {};
  for (const [name, value] of new FormData(form).entries()) {
    if (name in values) continue;
    values[name] = typeof value === "string" ? value : value.name;
  }
  return values;
}

/** Focuses the first control (in the form's order) whose name has an error. */
export function focusFirstInvalid(
  form: HTMLFormElement | null,
  errors: FieldErrors,
): boolean {
  if (!form) return false;
  const names = new Set(Object.keys(errors));
  if (names.size === 0) return false;
  for (const element of Array.from(form.elements)) {
    const name = (element as HTMLInputElement).name;
    if (!name || !names.has(name)) continue;
    // A hidden input (a Select's value) is not focusable: use its field's control.
    const target =
      (element as HTMLInputElement).type === "hidden"
        ? element
            .closest('[data-slot="field"]')
            ?.querySelector<HTMLElement>(
              'button, input:not([type="hidden"]), textarea, [tabindex]',
            )
        : (element as HTMLElement);
    if (target) {
      target.focus();
      return true;
    }
  }
  return false;
}

export type UseSubmitOptions<Result> = UseActionOptions<
  [values: FormValues],
  Result
>;

export interface UseSubmit<Result> extends UseAction<
  [values: FormValues],
  Result
> {
  /** Spread on the `<form>`: submits once, marks it busy, focuses the first server-rejected field. */
  formProps: {
    ref: (form: HTMLFormElement | null) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    "aria-busy": boolean | undefined;
  };
}

/**
 * `useAction` for a form: submits the form's values once, however many times
 * it is submitted while pending, maps server errors to fields (pass
 * `fieldErrors[name]` to each `Field`'s `error`) and moves focus to the first
 * one. Client-side validation on blur and submit is `useFormBehaviour`.
 */
export function useSubmit<Result>(
  submit: (values: FormValues, context: ActionContext) => Promise<Result>,
  options: UseSubmitOptions<Result> = {},
): UseSubmit<Result> {
  const formRef = useRef<HTMLFormElement | null>(null);
  const action = useAction<[values: FormValues], Result>(
    (context, values) => submit(values, context),
    {
      ...options,
      onError: (error, values) => {
        options.onError?.(error, values);
      },
    },
  );
  const { fieldErrors, status } = action;
  useEffect(() => {
    if (status === "error") focusFirstInvalid(formRef.current, fieldErrors);
  }, [status, fieldErrors]);

  return {
    ...action,
    formProps: {
      ref: (form) => {
        formRef.current = form;
      },
      onSubmit: (event) => {
        event.preventDefault();
        void action.run(readFormValues(event.currentTarget));
      },
      "aria-busy": action.pending || undefined,
    },
  };
}

/**
 * Calls `callback` at most once per `intervalMs` (300 ms by default) while
 * calls keep coming, then once more with the newest arguments. For map
 * bounds, scroll and resize; debounce text input instead.
 */
export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  intervalMs: number = THROTTLE_MS,
  options: ThrottleOptions = {},
): DebouncedCallback<Args> {
  const latest = useLatestRef(callback);
  const { leading, trailing } = options;
  const throttler = useMemo(
    () =>
      createThrottler<Args>((...args) => latest.current(...args), intervalMs, {
        leading,
        trailing,
      }),
    [intervalMs, leading, trailing, latest],
  );
  useEffect(() => () => throttler.cancel(), [throttler]);
  return useMemo(
    () =>
      Object.assign((...args: Args) => throttler.call(...args), {
        cancel: throttler.cancel,
        flush: throttler.flush,
        isPending: throttler.pending,
      }),
    [throttler],
  );
}

export interface UseLatest {
  /** Starts a request and aborts the previous one; an older answer resolves `stale`. */
  run: <Value>(
    task: (signal: AbortSignal) => Promise<Value>,
  ) => Promise<LatestResult<Value>>;
  abort: () => void;
  pending: boolean;
}

/**
 * Only the newest request answers. Use it for anything that loads in
 * response to a choice (a day's slots, a filtered table): ignore results with
 * `status: "stale"`. The request in flight is aborted on unmount.
 */
export function useLatest(): UseLatest {
  const [pending, setPending] = useState(false);
  const latest = useMemo(() => createLatest(setPending), []);
  useEffect(() => () => latest.abort(), [latest]);
  return useMemo(
    () => ({ run: latest.run, abort: latest.abort, pending }),
    [latest, pending],
  );
}

export interface UseLeaveGuard {
  /** Wraps a navigation: asks first while there are unsaved changes. */
  guard: (navigate: () => void) => Promise<void>;
}

/**
 * Asks before leaving with unsaved changes: the browser's own prompt for a
 * reload, a closed tab or an outside link, and `guard()` for in-app
 * navigation (route changes, closing a sheet). `ask` defaults to the
 * browser's confirm; pass the confirm kit's dialog for an in-app one.
 */
export function useLeaveGuard(
  active: boolean,
  {
    message = "You have unsaved changes. Leave without saving?",
    ask,
  }: { message?: string; ask?: (message: string) => Promise<boolean> } = {},
): UseLeaveGuard {
  const latest = useLatestRef({ active, message, ask });
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
  return useMemo(
    () => ({
      guard: async (navigate) => {
        const current = latest.current;
        if (!current.active) {
          navigate();
          return;
        }
        const leave = current.ask
          ? await current.ask(current.message)
          : window.confirm(current.message);
        if (leave) navigate();
      },
    }),
    [latest],
  );
}

export interface UseAutosaveOptions<Value> {
  save: (value: Value, context: { signal: AbortSignal }) => Promise<unknown>;
  /** Quiet time before saving; 2 s by default. */
  delayMs?: number;
  /** Off while the draft is not loaded yet, so loading it does not save it. */
  enabled?: boolean;
  /** Ask before leaving while changes are unsaved. On by default. */
  guardLeave?: boolean;
}

export interface UseAutosave extends AutosaveState {
  /** Save now: bind it to the form's blur. */
  flush: () => Promise<void>;
  retry: () => Promise<void>;
  guard: UseLeaveGuard["guard"];
}

/**
 * Saves `value` (the whole draft) after typing stops and on `flush`, never
 * two saves at once, and guards leaving while anything is unsaved. Show the
 * state with `AutosaveStatus`.
 */
export function useAutosave<Value>(
  value: Value,
  {
    save,
    delayMs = AUTOSAVE_DELAY_MS,
    enabled = true,
    guardLeave = true,
  }: UseAutosaveOptions<Value>,
): UseAutosave {
  const latestSave = useLatestRef(save);
  const [state, setState] = useState<AutosaveState | null>(null);
  const autosave: Autosave<Value> = useMemo(
    () =>
      createAutosave<Value>(
        {
          delayMs,
          save: (draft, context) => latestSave.current(draft, context),
        },
        setState,
      ),
    [delayMs, latestSave],
  );
  useEffect(() => () => autosave.dispose(), [autosave]);

  const first = useRef(true);
  useEffect(() => {
    // The value as loaded is not a change.
    if (first.current || !enabled) {
      first.current = false;
      return;
    }
    autosave.change(value);
  }, [autosave, value, enabled]);

  const current = state ?? autosave.getState();
  const { guard } = useLeaveGuard(guardLeave && current.dirty);
  return {
    ...current,
    flush: autosave.flush,
    retry: autosave.retry,
    guard,
  };
}

export interface UsePendingNavigation {
  /** Runs the navigation inside a React transition. */
  navigate: (href: string) => void;
  /** True from the click until the new route has rendered. */
  pending: boolean;
  /** Pass to `TopProgress`: false for fast routes, then shown at least 400 ms. */
  showProgress: boolean;
}

/**
 * Progress for slow route changes. With the Next.js App Router:
 *
 *   const router = useRouter();
 *   const nav = usePendingNavigation(router.push);
 *   <TopProgress loading={nav.pending} />
 *
 * `router.push` inside `startTransition` keeps `pending` true until the new
 * route renders; the current page stays usable meanwhile.
 */
export function usePendingNavigation(
  navigate: (href: string) => void,
): UsePendingNavigation {
  const latest = useLatestRef(navigate);
  const [pending, startTransition] = useTransition();
  const showProgress = useDelayedLoading(pending);
  const go = useCallback(
    (href: string) => {
      startTransition(() => {
        latest.current(href);
      });
    },
    [latest],
  );
  return { navigate: go, pending, showProgress };
}

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/**
 * Whether the browser says it is online. True on the server and before
 * hydration, so nothing flashes "offline" on load. The browser can be wrong
 * the other way (online but the network is down), so a failed request is
 * still the real signal.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Whether the person asked for reduced motion. False on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
