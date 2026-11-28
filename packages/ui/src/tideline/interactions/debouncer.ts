/**
 * A debouncer and a throttler with no framework in them, so the timing rules
 * are tested once and shared by the hooks in `debounce.ts`.
 */
export interface Debouncer<Args extends unknown[]> {
  /** Schedules a call with these arguments, replacing any waiting call. */
  call: (...args: Args) => void;
  /** Drops the waiting call, if any. */
  cancel: () => void;
  /** Runs the waiting call now, if any. */
  flush: () => void;
  /** Whether a call is waiting. */
  pending: () => boolean;
}

export interface DebounceOptions {
  /**
   * Run the first call of a burst at once. Later calls in the burst wait, and
   * run on the trailing edge only if there were any. Off by default.
   */
  leading?: boolean;
  /** Run the last call once the burst has been quiet for the delay. On by default. */
  trailing?: boolean;
}

/**
 * Calls `callback` once a burst of calls has been quiet for `delayMs`, with
 * the newest arguments (the trailing edge). With `leading`, the first call of
 * a burst also runs at once.
 */
export function createDebouncer<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
  { leading = false, trailing = true }: DebounceOptions = {},
): Debouncer<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: Args | undefined;

  const run = () => {
    const args = waiting;
    timer = undefined;
    waiting = undefined;
    if (args) callback(...args);
  };

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    waiting = undefined;
  };

  /** The burst is over: run what is waiting (trailing) and stop. */
  const settle = () => {
    timer = undefined;
    if (trailing) run();
    else waiting = undefined;
  };

  return {
    call: (...args) => {
      if (delayMs <= 0) {
        cancel();
        callback(...args);
        return;
      }
      const burstStarting = timer === undefined;
      if (timer !== undefined) clearTimeout(timer);
      if (leading && burstStarting) {
        waiting = undefined;
        callback(...args);
      } else {
        waiting = args;
      }
      timer = setTimeout(settle, delayMs);
    },
    cancel,
    flush: () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      run();
    },
    pending: () => waiting !== undefined,
  };
}

export type Throttler<Args extends unknown[]> = Debouncer<Args>;

export interface ThrottleOptions {
  /** Run the first call at once. On by default. */
  leading?: boolean;
  /** Run the newest call at the end of an interval that saw more calls. On by default. */
  trailing?: boolean;
}

/**
 * Calls `callback` at most once per `intervalMs` while calls keep coming, and
 * once more with the newest arguments when they stop (the settle call). Use
 * it for signals that must keep flowing, like map bounds while panning.
 */
export function createThrottler<Args extends unknown[]>(
  callback: (...args: Args) => void,
  intervalMs: number,
  { leading = true, trailing = true }: ThrottleOptions = {},
): Throttler<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: Args | undefined;

  const tick = () => {
    if (trailing && waiting) {
      const args = waiting;
      waiting = undefined;
      callback(...args);
      // A trailing call opens a new interval, so the rate stays bounded.
      timer = setTimeout(tick, intervalMs);
      return;
    }
    timer = undefined;
    waiting = undefined;
  };

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    waiting = undefined;
  };

  return {
    call: (...args) => {
      if (intervalMs <= 0) {
        callback(...args);
        return;
      }
      if (timer === undefined) {
        if (leading) callback(...args);
        else waiting = args;
        timer = setTimeout(tick, intervalMs);
        return;
      }
      waiting = args;
    },
    cancel,
    flush: () => {
      const args = waiting;
      cancel();
      if (args) callback(...args);
    },
    pending: () => waiting !== undefined,
  };
}
