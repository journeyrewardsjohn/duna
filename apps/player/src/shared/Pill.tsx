import { View, type ViewStyle } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { colors, rgba } from "./palette";
import { styles } from "../legacy/styles";

export function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: string;
  readonly tone?: "neutral" | "positive" | "live" | "warning";
}) {
  const palette: Record<typeof tone, ViewStyle> = {
    neutral: {
      backgroundColor: rgba(colors.overlayRgb, 0.06),
      borderColor: rgba(colors.overlayRgb, 0.1),
    },
    positive: {
      backgroundColor: rgba(colors.positiveRgb, 0.1),
      borderColor: rgba(colors.positiveRgb, 0.25),
    },
    live: {
      backgroundColor: rgba(colors.flareRgb, 0.1),
      borderColor: rgba(colors.flareRgb, 0.3),
    },
    warning: {
      backgroundColor: rgba(colors.warningRgb, 0.1),
      borderColor: rgba(colors.warningRgb, 0.25),
    },
  };
  return (
    <View style={[styles.pill, palette[tone]]}>
      <Text
        style={[
          styles.pillText,
          tone === "positive" && { color: colors.positive },
          tone === "live" && { color: "#ff9a7a" },
          tone === "warning" && { color: colors.warning },
        ]}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}
