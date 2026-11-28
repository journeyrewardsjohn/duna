/**
 * Interaction quality: debounce and throttle, search, delayed loading,
 * optimistic updates, single-flight actions with idempotency keys, latest-only
 * requests, autosave, leave guards, pending navigation and connectivity.
 */
export {
  createDebouncer,
  createThrottler,
  type DebounceOptions,
  type Debouncer,
  type ThrottleOptions,
  type Throttler,
} from "./debouncer";
export {
  useDebouncedCallback,
  useDebouncedValue,
  type DebouncedCallback,
} from "./debounce";
export {
  createAsyncSearch,
  createDelayedLoading,
  LOADING_DELAY_MS,
  LOADING_MIN_MS,
  runOptimisticAction,
  SEARCH_DEBOUNCE_MS,
  withViewTransition,
  type AsyncSearch,
  type AsyncSearchOptions,
  type AsyncSearchState,
  type AsyncSearchStatus,
  type DelayedLoading,
  type DelayedLoadingOptions,
  type OptimisticActionOptions,
} from "./interaction-core";
export {
  useAsyncSearch,
  useDelayedLoading,
  useOptimisticAction,
  type OptimisticMessages,
  type UseAsyncSearch,
  type UseOptimisticActionOptions,
} from "./interactions";
export {
  AUTOSAVE_DELAY_MS,
  DEBOUNCE_MS,
  REPEAT_GUARD_MS,
  SUCCESS_HOLD_MS,
  THROTTLE_MS,
  UNDO_WINDOW_MS,
} from "./timing";
export {
  createIdempotencyKey,
  errorMessage,
  errorReference,
  fieldErrorsFrom,
  isAbortError,
  type FieldErrors,
} from "./errors";
export {
  createAction,
  type ActionContext,
  type ActionOptions,
  type ActionOutcome,
  type ActionState,
  type ActionStatus,
  type SingleFlightAction,
} from "./submit-core";
export { createLatest, type Latest, type LatestResult } from "./latest-core";
export {
  createAutosave,
  type Autosave,
  type AutosaveOptions,
  type AutosaveState,
  type AutosaveStatus as AutosaveStatusName,
} from "./autosave-core";
export {
  focusFirstInvalid,
  preventKeyRepeat,
  readFormValues,
  useAction,
  useAutosave,
  useLatest,
  useLeaveGuard,
  useOnline,
  usePendingNavigation,
  useReducedMotion,
  useSubmit,
  useThrottledCallback,
  type ActionMessages,
  type FormValues,
  type OptimisticUpdate,
  type UseAction,
  type UseActionOptions,
  type UseAutosave,
  type UseAutosaveOptions,
  type UseLatest,
  type UseLeaveGuard,
  type UsePendingNavigation,
  type UseSubmit,
  type UseSubmitOptions,
} from "./kit-hooks";
