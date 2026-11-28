import { useProRuntime } from "../../runtime";
import { Pressable } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function PreviewBanner({
  onOpenLayoutLab,
}: {
  /** Preview builds only: opens the development Layout lab. */
  readonly onOpenLayoutLab?: () => void;
}) {
  const { mode } = useProRuntime();
  if (mode !== "preview") return null;
  return (
    <Pressable
      accessibilityHint="Opens the development Layout lab"
      accessibilityRole="button"
      onLongPress={onOpenLayoutLab}
      style={styles.previewBanner}
    >
      <Text style={styles.previewBannerText}>
        PREVIEW DATA · LIVE OPERATIONS AND MONEY ACTIONS ARE DISABLED
      </Text>
    </Pressable>
  );
}
