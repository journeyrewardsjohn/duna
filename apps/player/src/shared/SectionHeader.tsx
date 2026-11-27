import { Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { styles } from "../legacy/styles";

export function SectionHeader({
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
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{action} →</Text>
        </Pressable>
      )}
    </View>
  );
}
