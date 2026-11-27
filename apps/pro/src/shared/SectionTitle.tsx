import { View, Pressable } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function SectionTitle({
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
  return (
    <View style={styles.sectionTitle}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionHeading}>{title}</Text>
      </View>
      {action && (
        <Pressable disabled={!onAction} onPress={onAction}>
          <Text style={styles.linkText}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}
