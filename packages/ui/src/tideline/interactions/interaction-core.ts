/**
 * The interaction rules behind Tideline's loading, search and optimistic
 * updates, with no framework in them. The hooks in `interactions.ts` are
 * thin wrappers; the timing and ordering rules are tested here once.
 */
import { createDebouncer } from "./debouncer";

export interface DelayedLoadingOptions {
  /** Work that finishes sooner than this shows no loader at all. */
  delayMs?: number;
  /** Once a loader shows, it stays at least this long, so it never flickers. */
  minDurationMs?: number;
}

export const LOADING_DELAY_MS = 250;
export const LOADING_MIN_MS = 400;
export const SEARCH_DEBOUNCE_MS = 220;

export interface DelayedLoading {
  /** Tell it whether the work is running. */
  set: (loading: boolean) => void;
  /** Whether the loader should be on screen now. */
  isVisible: () => boolean;
  dispose: () => void;
}

export function createDelayedLoading(
  onChange: (visible: boolean) => void,
  {
    delayMs = LOADING_DELAY_MS,
    minDurationMs = LOADING_MIN_MS,
  }: DelayedLoadingOptions = {},
): DelayedLoading {
  let loading = false;
  let visible = false;
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const show = () => {
    timer = undefined;
    visible = true;
    shownAt = Date.now();
    onChange(true);
  };
  const hide = () => {
    timer = undefined;
    visible = false;
    onChange(false);
  };

  return {
    set(next) {
      if (next === loading) return;
      loading = next;
      clear();
      if (next) {
        // Still on screen from the last run: it simply stays.
        if (visible) return;
        if (delayMs <= 0) show();
        else timer = setTimeout(show, delayMs);
        return;
      }
      if (!visible) return;
      const remaining = minDurationMs - (Date.now() - shownAt);
      if (remaining > 0) timer = setTimeout(hide, remaining);
      else hide();
    },
    isVisible: () => visible,
    dispose: clear,
  };
}

export type AsyncSearchStatus =
  "idle" | "loading" | "success" | "empty" | "error";

export interface AsyncSearchState<Item> {
  /** The text as typed. */
  query: string;
  status: AsyncSearchStatus;
  /** What to show now. Never emptied just because the person is typing. */
  results: Item[];
  /** The results answer an earlier query: keep them visible, dimmed. */
  stale: boolean;
  error: unknown;
}

export interface AsyncSearchOptions<Item> {
  /** Fetches matches. Honour `signal`: it aborts when the query changes. */
  search: (query: string, signal: AbortSignal) => Promise<Item[]>;
  /** Items already loaded. They are filtered at once, before any request. */
  items?: ReadonlyArray<Item>;
  /** Whether a loaded item matches. Needed to use `items`. */
  filter?: (item: Item, query: string) => boolean;
  /** Identifies an item, so a loaded match is not listed twice. */
  getKey?: (item: Item) => string;
  /** Quiet time before a request is sent. */
  debounceMs?: number;
  /** Fewer trimmed characters than this is not searched. */
  minLength?: number;
}

export interface AsyncSearch<Item> {
  getState: () => AsyncSearchState<Item>;
  /** Call on every keystroke. */
  setQuery: (query: string) => void;
  /** Search now, skipping the debounce: for Enter, and for Retry. */
  submit: () => void;
  /** Replace the already-loaded items. */
  setItems: (items: ReadonlyArray<Item>) => void;
  dispose: () => void;
}

export function createAsyncSearch<Item>(
  options: AsyncSearchOptions<Item>,
  onChange: (state: AsyncSearchState<Item>) => void,
): AsyncSearch<Item> {
  const {
    search,
    filter,
    getKey,
    debounceMs = SEARCH_DEBOUNCE_MS,
    minLength = 1,
  } = options;
  let items = options.items ?? [];
  let state: AsyncSearchState<Item> = {
    query: "",
    status: "idle",
    results: [],
    stale: false,
    error: null,
  };
  let controller: AbortController | undefined;
  let latest = 0;

  const emit = (patch: Partial<AsyncSearchState<Item>>) => {
    state = { ...state, ...patch };
    onChange(state);
  };
  const local = (query: string) =>
    filter ? items.filter((item) => filter(item, query)) : [];
  const merge = (loaded: Item[], fetched: Item[]) => {
    if (!getKey) return loaded.length > 0 ? [...loaded, ...fetched] : fetched;
    const seen = new Set(loaded.map(getKey));
    return [...loaded, ...fetched.filter((item) => !seen.has(getKey(item)))];
  };
  /** Drops the in-flight request: its answer is for an older query. */
  const abandon = () => {
    controller?.abort();
    controller = undefined;
    latest += 1;
  };

  const run = (query: string) => {
    abandon();
    const request = latest;
    controller = new AbortController();
    const { signal } = controller;
    search(query, signal).then(
      (fetched) => {
        if (request !== latest || signal.aborted) return;
        controller = undefined;
        const results = merge(local(query), fetched);
        emit({
          results,
          stale: false,
          status: results.length > 0 ? "success" : "empty",
          error: null,
        });
      },
      (error: unknown) => {
        if (request !== latest || signal.aborted) return;
        controller = undefined;
        // The last good results stay, marked stale, under the error.
        emit({ status: "error", error, stale: state.results.length > 0 });
      },
    );
  };
  const debounced = createDebouncer(run, debounceMs);
  const tooShort = (query: string) =>
    query.trim().length < Math.max(1, minLength);

  return {
    getState: () => state,
    setQuery(query) {
      debounced.cancel();
      abandon();
      if (tooShort(query)) {
        emit({ query, status: "idle", results: [], stale: false, error: null });
        return;
      }
      const trimmed = query.trim();
      const loaded = local(trimmed);
      emit({
        query,
        status: "loading",
        error: null,
        // Loaded matches show at once; otherwise the previous results stay.
        results: loaded.length > 0 ? loaded : state.results,
        stale: loaded.length === 0 && state.results.length > 0,
      });
      debounced.call(trimmed);
    },
    submit() {
      debounced.cancel();
      if (tooShort(state.query)) return;
      emit({ status: "loading", error: null });
      run(state.query.trim());
    },
    setItems(next) {
      items = next;
    },
    dispose() {
      debounced.cancel();
      abandon();
    },
  };
}

export interface OptimisticActionOptions<Args extends unknown[]> {
  /** Makes the change on screen now, and returns how to take it back. */
  apply: (...args: Args) => () => void;
  /** Saves the change. A rejection rolls the screen back. */
  commit: (...args: Args) => Promise<unknown>;
  /** Saves the reverse, when the person presses Undo. */
  undo?: (...args: Args) => Promise<unknown>;
  /** The change is saved. `undo` reverses it on screen and on the server. */
  onSuccess?: (context: { args: Args; undo: () => Promise<boolean> }) => void;
  /** The change, or its undo, failed and the screen was put back. */
  onError?: (context: { args: Args; error: unknown }) => void;
}

/**
 * Runs one optimistic change. Resolves `true` when it was saved and `false`
 * when it was rolled back; it never rejects.
 */
export async function runOptimisticAction<Args extends unknown[]>(
  options: OptimisticActionOptions<Args>,
  ...args: Args
): Promise<boolean> {
  const rollback = options.apply(...args);
  try {
    await options.commit(...args);
  } catch (error) {
    rollback();
    options.onError?.({ args, error });
    return false;
  }
  let undone = false;
  options.onSuccess?.({
    args,
    undo: async () => {
      // Undo is itself optimistic, and only runs once.
      if (undone) return false;
      undone = true;
      rollback();
      try {
        await options.undo?.(...args);
        return true;
      } catch (error) {
        undone = false;
        options.apply(...args);
        options.onError?.({ args, error });
        return false;
      }
    },
  });
  return true;
}

/**
 * Runs a DOM update inside a view transition where the browser supports it
 * and motion is welcome, and just runs it otherwise.
 */
export function withViewTransition(update: () => void): void {
  const doc =
    typeof document === "undefined"
      ? undefined
      : (document as Document & {
          startViewTransition?: (callback: () => void) => unknown;
        });
  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc?.startViewTransition || reduced) {
    update();
    return;
  }
  doc.startViewTransition(update);
}
