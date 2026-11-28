/**
 * The Duna Pro lockup (M-R4): the Crest mark, the drawn wordmark exactly as
 * wide as the mark (brand book "Stacked"), and PRO in Geist Mono beneath.
 * Colours follow the brand book's ground table: Dune mark and Salt wordmark
 * on Night Court; Night Court on Salt. Replaces the retired PNG mark.
 */
import { View } from "react-native";
import {
  DunaMark,
  DunaWordmark,
  MARK_RATIO,
  Text,
  useTheme,
} from "@duna/ui/native";

export function ProLockup({
  markHeight = 96,
  label = "Duna Pro",
}: {
  readonly markHeight?: number;
  readonly label?: string;
}) {
  const { scheme, tokens } = useTheme();
  const dark = scheme === "dark";
  const markColor = dark ? tokens.brand.dune : tokens.brand["night-court"];
  const wordColor = dark ? tokens.brand.salt : tokens.brand["night-court"];
  const width = markHeight * MARK_RATIO;
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      accessible
      style={{ alignItems: "center", gap: markHeight * 0.17 }}
    >
      <DunaMark color={markColor} decorative size={markHeight} />
      <DunaWordmark color={wordColor} width={width} />
      <Text
        family="mono"
        maxFontSizeMultiplier={1.3}
        style={{ color: markColor, letterSpacing: 6, marginLeft: 6 }}
        variant="phone-meta"
        weight={600}
      >
        PRO
      </Text>
    </View>
  );
}
