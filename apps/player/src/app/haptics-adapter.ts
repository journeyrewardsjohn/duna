import type { HapticsAdapter } from "@duna/ui/native";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const run = (call: () => Promise<void>) => {
  if (Platform.OS !== "web") void call().catch(() => undefined);
};

/** The app's expo-haptics calls, for the design system's HapticsProvider. */
export const hapticsAdapter: HapticsAdapter = {
  selection: () => run(() => Haptics.selectionAsync()),
  impact: (weight) =>
    run(() =>
      Haptics.impactAsync(
        weight === "heavy"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : weight === "medium"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
      ),
    ),
  notification: (kind) =>
    run(() =>
      Haptics.notificationAsync(
        kind === "error"
          ? Haptics.NotificationFeedbackType.Error
          : kind === "warning"
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
      ),
    ),
};
