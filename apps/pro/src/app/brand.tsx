import { View } from "react-native";
import { DunaMark, DunaWordmark } from "@duna/ui/native";

/**
 * The Duna lockup for legacy screens (Club tools): the Crest mark and the
 * drawn wordmark from the design system, replacing the retired raster
 * wordmark and dune mark. Follows the theme.
 */
export function BrandMark() {
  return (
    <View
      accessibilityLabel="Duna"
      accessibilityRole="image"
      accessible
      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
    >
      <DunaMark decorative size={22} />
      <DunaWordmark width={64} />
    </View>
  );
}
