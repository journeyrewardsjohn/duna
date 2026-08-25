import { StyleSheet, View } from "react-native";

export interface LiquidGlassSurfaceProps {
  readonly borderColor: string;
  readonly cornerRadius: number;
  readonly fallbackColor: string;
  readonly tint: string;
}

export function LiquidGlassSurface({
  borderColor,
  cornerRadius,
  fallbackColor,
}: LiquidGlassSurfaceProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: fallbackColor,
          borderColor,
          borderRadius: cornerRadius,
          borderWidth: 1,
        },
      ]}
    />
  );
}
