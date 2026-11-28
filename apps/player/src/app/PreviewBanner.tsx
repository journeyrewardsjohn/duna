import { Pressable, View } from "react-native";
import { usePlayerRuntime } from "../../runtime";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function PreviewBanner({
  hidden = false,
  onOpenLayoutLab,
}: {
  readonly hidden?: boolean;
  /** Preview builds only: a long press opens the development Layout lab. */
  readonly onOpenLayoutLab?: () => void;
}) {
  const { isOffline, lastSuccessfulSyncAt, mode } = usePlayerRuntime();
  if (hidden) return null;
  if (mode === "preview") {
    return (
      <Pressable
        accessibilityHint="Opens the development Layout lab"
        accessibilityRole="button"
        onLongPress={onOpenLayoutLab}
        style={styles.previewBanner}
      >
        <Text style={styles.previewBannerText}>
          PREVIEW · SIGN-IN AND PAYMENTS ARE DISABLED
        </Text>
      </Pressable>
    );
  }
  if (!isOffline) return null;
  return (
    <View style={styles.offlineModeBanner}>
      <Text style={styles.offlineModeBannerText}>
        OFFLINE MODE · RECORD AND BROWSE SAVED DATA. BOOKINGS AND PAYMENTS
        RESUME WHEN YOU RECONNECT
      </Text>
      {lastSuccessfulSyncAt && (
        <Text style={styles.offlineModeBannerMeta}>
          Last synced{" "}
          {new Date(lastSuccessfulSyncAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      )}
    </View>
  );
}
