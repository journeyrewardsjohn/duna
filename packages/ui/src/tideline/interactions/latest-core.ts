/**
 * Only the newest request may answer. Each `run` aborts the one before it
 * (through its `AbortSignal`), and a request that answers after a newer one
 * started resolves as `stale`, so results never arrive out of order. The
 * booking flow's slot list is the cautionary example: a slow answer for
 * Tuesday must never replace the list for Wednesday.
 */
import { isAbortError } from "./errors";

export type LatestResult<Value> =
  | { status: "ok"; value: Value }
  /** A newer request started; ignore this answer. */
  | { status: "stale" }
  | { status: "error"; error: unknown };

export interface Latest {
  run: <Value>(
    task: (signal: AbortSignal) => Promise<Value>,
  ) => Promise<LatestResult<Value>>;
  /** Aborts the request in flight; its answer resolves as `stale`. */
  abort: () => void;
  isPending: () => boolean;
}

export function createLatest(
  onPendingChange: (pending: boolean) => void = () => {},
): Latest {
  let generation = 0;
  let controller: AbortController | undefined;
  let pending = false;

  const setPending = (next: boolean) => {
    if (next === pending) return;
    pending = next;
    onPendingChange(next);
  };

  const abort = () => {
    controller?.abort();
    controller = undefined;
    generation += 1;
    setPending(false);
  };

  return {
    async run(task) {
      controller?.abort();
      generation += 1;
      const mine = generation;
      const current = new AbortController();
      controller = current;
      setPending(true);
      try {
        const value = await task(current.signal);
        if (mine !== generation || current.signal.aborted) {
          return { status: "stale" };
        }
        controller = undefined;
        setPending(false);
        return { status: "ok", value };
      } catch (error) {
        if (
          mine !== generation ||
          current.signal.aborted ||
          isAbortError(error)
        ) {
          return { status: "stale" };
        }
        controller = undefined;
        setPending(false);
        return { status: "error", error };
      }
    },
    abort,
    isPending: () => pending,
  };
}
