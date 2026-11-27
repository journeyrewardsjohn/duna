import { useWindowDimensions, View, Pressable } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function PageTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: string;
  readonly onAction?: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  return (
    <View style={[styles.pageTitle, compact && styles.pageTitleCompact]}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text
          style={[styles.displayTitle, compact && styles.displayTitleCompact]}
        >
          {title}
        </Text>
      </View>
      {action && (
        <Pressable
          disabled={!onAction}
          onPress={onAction}
          style={[styles.primaryAction, !onAction && styles.buttonDisabled]}
        >
          <Text style={styles.primaryActionText}>＋ {action}</Text>
        </Pressable>
      )}
    </View>
  );
}
