import { Host, RoundedRectangle } from "@expo/ui/swift-ui";
import { foregroundStyle, glassEffect } from "@expo/ui/swift-ui/modifiers";
import { Platform, StyleSheet, View } from "react-native";

interface LiquidGlassSurfaceProps {
  readonly borderColor: string;
  readonly cornerRadius: number;
  readonly fallbackColor: string;
  readonly tint: string;
}

export function LiquidGlassSurface({
  borderColor,
  cornerRadius,
  fallbackColor,
  tint,
}: LiquidGlassSurfaceProps) {
  const nativeGlass = Number(Platform.Version) >= 26;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: nativeGlass
              ? "rgba(255,255,255,0.28)"
              : fallbackColor,
            borderColor,
            borderRadius: cornerRadius,
            borderWidth: 1,
          },
        ]}
      />
      {nativeGlass && (
        <Host
          colorScheme="light"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <RoundedRectangle
            cornerRadius={cornerRadius}
            modifiers={[
              foregroundStyle("rgba(255,255,255,0.06)"),
              glassEffect({
                glass: { variant: "clear", tint },
                shape: "roundedRectangle",
                cornerRadius,
              }),
            ]}
          />
        </Host>
      )}
    </View>
  );
}
