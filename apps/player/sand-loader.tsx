import { usePlayerDesign } from "./design-theme";
import { sandColors, sandParticle } from "@duna/ui/sand";
import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { SatoshiText as Text } from "./satoshi-text";

export function SandLoader({
  label = "Loading Duna",
  size = 150,
  tone = "default",
}: {
  readonly label?: string;
  readonly size?: number;
  readonly tone?: "default" | "inverse";
}) {
  const { tokens } = usePlayerDesign();
  const [time, setTime] = useState(0);
  useEffect(() => {
    let reduced = true;
    let disposed = false;
    let frame = 0;
    let last = 0;
    const animate = (now: number) => {
      if (now - last >= 50) {
        setTime(now / 1000);
        last = now;
      }
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (!disposed && !reduced && AppState.currentState === "active")
        frame = requestAnimationFrame(animate);
    };
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      reduced = value;
      sync();
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reduced = value;
        sync();
      },
    );
    const app = AppState.addEventListener("change", sync);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      motion.remove();
      app.remove();
    };
  }, []);
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={styles.loader}
    >
      <Svg accessible={false} width={size} height={size} viewBox="0 0 100 100">
        {Array.from({ length: 160 }, (_, index) => {
          const p = sandParticle(index, 160, time);
          return (
            <Circle
              key={index}
              cx={p.x}
              cy={p.y}
              r={p.radius}
              opacity={p.opacity}
              fill={tone === "inverse" ? sandColors.surface : tokens.text1}
            />
          );
        })}
      </Svg>
      <Text
        style={[
          styles.label,
          { color: tokens.text2 },
          tone === "inverse" && { color: sandColors.inset },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  loader: { alignItems: "center", gap: 15 },
  label: { color: sandColors.muted, fontSize: 15, lineHeight: 22 },
});
