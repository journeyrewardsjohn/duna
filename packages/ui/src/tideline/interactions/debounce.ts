"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createDebouncer, type DebounceOptions } from "./debouncer";
import { DEBOUNCE_MS } from "./timing";

/**
 * Returns `value` once it has stopped changing for `delayMs` (220 ms by
 * default). The first render returns the value as given. A waiting update is
 * dropped on unmount.
 */
export function useDebouncedValue<Value>(
  value: Value,
  delayMs: number = DEBOUNCE_MS,
): Value {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return delayMs <= 0 ? value : debounced;
}

export interface DebouncedCallback<Args extends unknown[]> {
  (...args: Args): void;
  /** Drops the waiting call. */
  cancel: () => void;
  /** Runs the waiting call now. */
  flush: () => void;
  /** Whether a call is waiting. */
  isPending: () => boolean;
}

/**
 * Returns a stable function that calls `callback` once, with the latest
 * arguments, after calls have stopped for `delayMs` (the trailing edge; 220 ms
 * by default). `{ leading: true }` also runs the first call of a burst at
 * once. It always runs the newest `callback`, and a waiting call is cancelled
 * on unmount so nothing runs against a screen that is gone.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number = DEBOUNCE_MS,
  options: DebounceOptions = {},
): DebouncedCallback<Args> {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });

  const { leading, trailing } = options;
  const debouncer = useMemo(
    () =>
      createDebouncer<Args>((...args) => latest.current(...args), delayMs, {
        leading,
        trailing,
      }),
    [delayMs, leading, trailing],
  );

  useEffect(() => () => debouncer.cancel(), [debouncer]);

  return useMemo(
    () =>
      Object.assign((...args: Args) => debouncer.call(...args), {
        cancel: debouncer.cancel,
        flush: debouncer.flush,
        isPending: debouncer.pending,
      }),
    [debouncer],
  );
}
