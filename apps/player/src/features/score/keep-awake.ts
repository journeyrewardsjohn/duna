/**
 * Keeps the screen on while a match is scored (M-P4a). The native side is
 * Expo's own keep-awake module, which `expo` already links into the app;
 * it is reached through `expo-modules-core` so no package is added. Where
 * it is missing (tests, an old binary), scoring works and the screen may
 * sleep as usual.
 */
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect } from "react";

interface KeepAwakeModule {
  activate?: (tag: string) => Promise<void> | void;
  deactivate?: (tag: string) => Promise<void> | void;
}

const native = requireOptionalNativeModule<KeepAwakeModule>("ExpoKeepAwake");

export function useKeepScreenOn(active: boolean, tag = "duna-live-score") {
  useEffect(() => {
    if (!active || !native?.activate) return;
    void Promise.resolve(native.activate(tag)).catch(() => undefined);
    return () => {
      void Promise.resolve(native.deactivate?.(tag)).catch(() => undefined);
    };
  }, [active, tag]);
}
