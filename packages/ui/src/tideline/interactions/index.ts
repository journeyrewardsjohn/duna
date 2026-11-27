/** Interaction quality: debounce, search, delayed loading, optimistic updates. */
export { createDebouncer, type Debouncer } from "./debouncer";
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
