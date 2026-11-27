import { View } from "react-native";
import { usePlayerRuntime } from "../../runtime";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function PreviewBanner({
  hidden = false,
}: {
  readonly hidden?: boolean;
}) {
  const { isOffline, lastSuccessfulSyncAt, mode } = usePlayerRuntime();
  if (hidden) return null;
  if (mode === "preview") {
    return (
      <View style={styles.previewBanner}>
        <Text style={styles.previewBannerText}>
          PREVIEW · SIGN-IN AND PAYMENTS ARE DISABLED
        </Text>
      </View>
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
