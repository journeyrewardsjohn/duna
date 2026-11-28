/**
 * A decorative repeating animation that can never gate content (M-R4).
 *
 * Each cycle runs through `runWithWatchdog` (docs/mobile/DESIGN_SYSTEM.md,
 * "Motion never gates content"): if the native driver never reports a
 * cycle's end, the watchdog settles the values at rest and the next cycle
 * starts anyway. Nothing waits on it: the values start at their resting
 * state, so with motion off (reduced motion, or `enabled = false`) the
 * drawing is complete and still.
 */
import { useEffect } from "react";
import type { Animated } from "react-native";
import { runWithWatchdog, settleValues } from "@duna/ui/native";

export function useAmbientCycle({
  enabled,
  build,
  cycleMs,
  rest,
  deps,
}: {
  readonly enabled: boolean;
  /** One cycle, starting from the values' current state. */
  readonly build: () => Animated.CompositeAnimation;
  /** The cycle's whole timeline (delays included). */
  readonly cycleMs: number;
  /** Each value and its resting state (shown under reduced motion). */
  readonly rest: readonly (readonly [Animated.Value, number])[];
  readonly deps: readonly unknown[];
}): void {
  useEffect(() => {
    const settle = settleValues(rest);
    if (!enabled) {
      settle();
      return;
    }
    let cancel: (() => void) | undefined;
    let stopped = false;
    const next = () => {
      if (stopped) return;
      cancel = runWithWatchdog(build(), {
        timeline: cycleMs,
        settle,
        onFinish: next,
      });
    };
    next();
    return () => {
      stopped = true;
      cancel?.();
      settle();
    };
  }, [enabled, cycleMs, ...deps]);
}
