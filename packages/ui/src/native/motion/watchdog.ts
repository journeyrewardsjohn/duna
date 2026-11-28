import type { Animated } from "react-native";

/** How long past its own timeline an animation may take before it is finished for it. */
export const WATCHDOG_SLACK_MS = 1000;

export interface WatchdogOptions {
  /**
   * The animation's whole timeline in milliseconds, delay included. The
   * watchdog fires `WATCHDOG_SLACK_MS` (or `slack`) after this.
   */
  readonly timeline: number;
  /** Put every animated value at its end state (content visible, touchable). */
  readonly settle: () => void;
  /**
   * Runs exactly once, when the animation finishes or the watchdog fires,
   * whichever comes first. Not run when cancelled, or when the animation was
   * interrupted (`finished: false`) and the watchdog is cancelled with it.
   */
  readonly onFinish?: () => void;
  readonly slack?: number;
}

/**
 * Motion never gates content. Starts `animation` and guarantees its end
 * state is reached: if the completion callback has not fired within the
 * timeline plus a second (the native driver can silently never finish, for
 * instance on a simulator), the animation is stopped, `settle()` puts the
 * values at rest and `onFinish` runs. Finishing is idempotent: a callback
 * that arrives after the watchdog is ignored, and the other way round.
 *
 * Returns a cancel function for effect cleanup: stops the animation, clears
 * the timer and runs nothing.
 */
export function runWithWatchdog(
  animation: Animated.CompositeAnimation,
  { timeline, settle, onFinish, slack = WATCHDOG_SLACK_MS }: WatchdogOptions,
): () => void {
  let settled = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (settled || cancelled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    onFinish?.();
  };

  timer = setTimeout(
    () => {
      timer = undefined;
      if (settled || cancelled) return;
      animation.stop();
      settle();
      finish();
    },
    Math.max(0, timeline) + slack,
  );

  animation.start(({ finished }) => {
    if (finished) finish();
  });

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    animation.stop();
  };
}

/** `settle` for a set of values: `settleValues([[progress, 1], [fade, 1]])`. */
export function settleValues(
  pairs: readonly (readonly [Animated.Value, number])[],
): () => void {
  return () => {
    for (const [value, end] of pairs) value.setValue(end);
  };
}
