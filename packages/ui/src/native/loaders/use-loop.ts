import { useEffect } from "react";
import { Animated } from "react-native";

/**
 * Runs a looping animation while `enabled` (loaders and the live indicator
 * are the only loops allowed). Stopped on unmount; reduced motion passes
 * `enabled = false` and the loader shows its resting state.
 */
export function useLoop(
  build: () => Animated.CompositeAnimation,
  enabled: boolean,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(build());
    loop.start();
    return () => loop.stop();
  }, [enabled, ...deps]);
}
