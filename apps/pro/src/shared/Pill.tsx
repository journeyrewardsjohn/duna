import { type ViewStyle, View } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { rgba, colors } from "./palette";
import { styles } from "../legacy/styles";

export function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: string;
  readonly tone?: "neutral" | "positive" | "warning" | "live";
}) {
  const style: Record<typeof tone, ViewStyle> = {
    neutral: {
      backgroundColor: rgba(colors.overlayRgb, 0.05),
      borderColor: rgba(colors.overlayRgb, 0.09),
    },
    positive: {
      backgroundColor: rgba(colors.positiveRgb, 0.08),
      borderColor: rgba(colors.positiveRgb, 0.22),
    },
    warning: {
      backgroundColor: rgba(colors.warningRgb, 0.08),
      borderColor: rgba(colors.warningRgb, 0.22),
    },
    live: {
      backgroundColor: rgba(colors.flareRgb, 0.08),
      borderColor: rgba(colors.flareRgb, 0.25),
    },
  };
  return (
    <View style={[styles.pill, style[tone]]}>
      <Text
        style={[
          styles.pillText,
          tone === "positive" && { color: colors.positive },
          tone === "warning" && { color: colors.warning },
          tone === "live" && { color: "#ff9a7a" },
        ]}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}
