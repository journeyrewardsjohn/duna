import { useProRuntime } from "../../runtime";
import { View } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function PreviewBanner() {
  const { mode } = useProRuntime();
  if (mode !== "preview") return null;
  return (
    <View style={styles.previewBanner}>
      <Text style={styles.previewBannerText}>
        PREVIEW DATA · LIVE OPERATIONS AND MONEY ACTIONS ARE DISABLED
      </Text>
    </View>
  );
}
