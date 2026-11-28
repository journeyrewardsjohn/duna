import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function selectionHaptic() {
  if (Platform.OS !== "web")
    void Haptics.selectionAsync().catch(() => undefined);
}

export function impactHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => undefined,
    );
  }
}

export function successHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
  }
}
