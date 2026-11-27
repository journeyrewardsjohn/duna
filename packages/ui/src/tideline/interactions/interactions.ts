"use client";

import { toast } from "@ui-sdk/react/toast";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AsyncSearchOptions,
  type AsyncSearchState,
  createAsyncSearch,
  createDelayedLoading,
  type DelayedLoadingOptions,
  type OptimisticActionOptions,
  runOptimisticAction,
} from "./interaction-core";

/**
 * Whether to show a loader for `loading`: not at all when the work takes
 * less than 250ms, and for at least 400ms once it does show.
 */
export function useDelayedLoading(
  loading: boolean,
  { delayMs, minDurationMs }: DelayedLoadingOptions = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const machine = useMemo(
    () => createDelayedLoading(setVisible, { delayMs, minDurationMs }),
    [delayMs, minDurationMs],
  );
  useEffect(() => {
    machine.set(loading);
  }, [machine, loading]);
  useEffect(() => () => machine.dispose(), [machine]);
  return visible;
}

export interface UseAsyncSearch<Item> extends AsyncSearchState<Item> {
  setQuery: (query: string) => void;
  /** Search now: bind it to Enter and to Retry. */
  submit: () => void;
}

/**
 * Search as you type, done properly: loaded items filter at once, the
 * request waits for a pause, a new keystroke aborts the request in flight,
 * a late answer to an old query is ignored, and the previous results stay
 * on screen (marked `stale`) while the next ones load.
 */
export function useAsyncSearch<Item>(
  options: AsyncSearchOptions<Item>,
): UseAsyncSearch<Item> {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const { debounceMs, minLength } = options;

  const [state, setState] = useState<AsyncSearchState<Item>>({
    query: "",
    status: "idle",
    results: [],
    stale: false,
    error: null,
  });
  const controller = useMemo(
    () =>
      createAsyncSearch<Item>(
        {
          debounceMs,
          minLength,
          // Always the newest callbacks, without restarting the search.
          search: (query, signal) => latest.current.search(query, signal),
          filter: latest.current.filter
            ? (item, query) => latest.current.filter?.(item, query) ?? false
            : undefined,
          getKey: latest.current.getKey
            ? (item) => latest.current.getKey?.(item) ?? ""
            : undefined,
        },
        setState,
      ),
    [debounceMs, minLength],
  );
  useEffect(() => {
    controller.setItems(options.items ?? []);
  }, [controller, options.items]);
  useEffect(() => () => controller.dispose(), [controller]);

  return useMemo(
    () => ({
      ...state,
      setQuery: controller.setQuery,
      submit: controller.submit,
    }),
    [state, controller],
  );
}

export interface OptimisticMessages<Args extends unknown[]> {
  /** Shown once the change is saved, with an Undo button. */
  success?: (...args: Args) => string;
  /** Shown when the change could not be saved and was put back. */
  error: (...args: Args) => string;
  undo?: string;
}

export interface UseOptimisticActionOptions<
  Args extends unknown[],
> extends Pick<OptimisticActionOptions<Args>, "apply" | "commit" | "undo"> {
  messages: OptimisticMessages<Args>;
}

/**
 * Makes a change on screen at once and saves it behind the scenes. If the
 * save fails the change is taken back and a Toast says so; if it succeeds a
 * Toast offers Undo. Returns the action and how many are still saving.
 */
export function useOptimisticAction<Args extends unknown[]>(
  options: UseOptimisticActionOptions<Args>,
): { run: (...args: Args) => Promise<boolean>; pending: number } {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [pending, setPending] = useState(0);

  const run = useMemo(
    () =>
      async (...args: Args) => {
        setPending((count) => count + 1);
        const saved = await runOptimisticAction<Args>(
          {
            apply: (...values) => latest.current.apply(...values),
            commit: (...values) => latest.current.commit(...values),
            undo: (...values) =>
              latest.current.undo?.(...values) ?? Promise.resolve(),
            onError: ({ args: values }) => {
              toast.error(latest.current.messages.error(...values));
            },
            onSuccess: ({ args: values, undo }) => {
              const message = latest.current.messages.success?.(...values);
              if (!message) return;
              toast(message, {
                action: {
                  label: latest.current.messages.undo ?? "Undo",
                  onAction: () => {
                    void undo();
                  },
                },
              });
            },
          },
          ...args,
        );
        setPending((count) => count - 1);
        return saved;
      },
    [],
  );

  return { run, pending };
}
