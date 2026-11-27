/**
 * A trailing-edge debouncer with no framework in it, so the timing rules are
 * tested once and shared by the hooks in `debounce.ts`.
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

export function createDebouncer<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
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

  return {
    call: (...args) => {
      if (timer !== undefined) clearTimeout(timer);
      waiting = args;
      if (delayMs <= 0) {
        run();
        return;
      }
      timer = setTimeout(run, delayMs);
    },
    cancel,
    flush: () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      run();
    },
    pending: () => timer !== undefined,
  };
}
