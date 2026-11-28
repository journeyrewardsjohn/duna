/**
 * The Crest at large scale as a moving field (M-R4): the three crests swell
 * out of the net line in turn, inner to outer, like the Rally loader slowed
 * to a tide. Used behind the Pro welcome (calm) and as the contactless field
 * on Tap to Pay (calm while ready, quick while reading, still on a result).
 * Drawn in code from the brand geometry; no video, no stock art.
 *
 * Decorative: hidden from VoiceOver, never gates content, still under
 * reduced motion (the finished mark).
 */
import { useRef } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";
import { CrestLayers, useReducedMotion } from "@duna/ui/native";
import { useAmbientCycle } from "./ambient-cycle";

export type CrestTempo = "still" | "calm" | "active";

const TEMPO: Readonly<
  Record<
    Exclude<CrestTempo, "still">,
    { swell: number; stagger: number; low: number }
  >
> = {
  // A slow tide: 2.4 s out and back per crest.
  calm: { swell: 1_200, stagger: 260, low: 0.55 },
  // Reading a card: the Rally loader's own pace.
  active: { swell: 550, stagger: 150, low: 0.35 },
};

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

export function CrestField({
  height,
  color,
  tempo = "calm",
  net = true,
  style,
  testID,
}: {
  /** Rendered height of the mark; width follows 59:74. */
  readonly height: number;
  readonly color: string;
  readonly tempo?: CrestTempo;
  /** Draw the net line (off for the contactless field: arcs only). */
  readonly net?: boolean;
  readonly style?: ViewStyle;
  readonly testID?: string;
}) {
  const reduceMotion = useReducedMotion();
  const crests = useRef([0, 1, 2].map(() => new Animated.Value(1))).current;
  const moving = tempo !== "still" && !reduceMotion;
  const pace = TEMPO[tempo === "still" ? "calm" : tempo];
  useAmbientCycle({
    enabled: moving,
    cycleMs: pace.swell * 2 + pace.stagger * 2,
    rest: crests.map((value) => [value, 1] as const),
    deps: [tempo],
    build: () =>
      Animated.parallel(
        // Inner (index 2) first, then middle, then outer.
        [2, 1, 0].map((crest, order) =>
          Animated.sequence([
            Animated.delay(order * pace.stagger),
            Animated.timing(crests[crest]!, {
              toValue: pace.low,
              duration: pace.swell,
              easing: ease,
              useNativeDriver: true,
            }),
            Animated.timing(crests[crest]!, {
              toValue: 1,
              duration: pace.swell,
              easing: ease,
              useNativeDriver: true,
            }),
            Animated.delay((2 - order) * pace.stagger),
          ]),
        ),
      ),
  });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={style}
      testID={testID}
    >
      <CrestLayers
        color={color}
        crests={[crests[0]!, crests[1]!, crests[2]!]}
        height={height}
        net={net ? 1 : 0}
      />
    </View>
  );
}
