import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "../type/Text";

export interface StateActionProps {
  readonly label: string;
  readonly onPress: () => void;
  /** `primary` (one per state) or `quiet`. */
  readonly kind?: "primary" | "quiet";
  readonly accessibilityHint?: string;
}

/**
 * The one next action inside a state part. A 48 pt target with the action
 * colours (Salt on Night Court in light, Night Court on Dune in dark). The
 * full Button family arrives with the component packages; this stays the
 * state parts' own action.
 */
export function StateAction({
  label,
  onPress,
  kind = "primary",
  accessibilityHint,
}: StateActionProps) {
  const { colors, tokens } = useTheme();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          minHeight: tokens.size.target,
          borderRadius: tokens.radius.pill,
          backgroundColor: primary
            ? pressed
              ? colors["action-hover"]
              : colors.action
            : "transparent",
          borderColor: primary ? "transparent" : colors["line-strong"],
        },
      ]}
    >
      <Text tone={primary ? "on-action" : "text"} variant="label" weight={600}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
});
