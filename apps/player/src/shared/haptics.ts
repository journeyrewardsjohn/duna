import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export function selectionHaptic() {
  if (Platform.OS !== "web")
    void Haptics.selectionAsync().catch(() => undefined);
}

export function successHaptic() {
  if (Platform.OS !== "web") {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => undefined);
  }
}
