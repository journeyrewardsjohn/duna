/**
 * The card turning over (spec motion `wallet.flip`): a real 3D turn, 620 ms
 * on the Rise curve, rotateY with perspective and hidden back faces, on the
 * native driver. Reduce Motion: a 200 ms cross-fade, no rotation. The face
 * that is turned away is hidden from VoiceOver and takes no touches. The
 * back may be taller than the card (large text): the frame grows to it.
 */
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "../motion";
import { runWithWatchdog, settleValues } from "../motion/watchdog";

export const FLIP_MS = 620;
export const FLIP_REDUCED_MS = 200;
const RISE = Easing.bezier(0.2, 0.8, 0.2, 1);

export function CardFlip({
  front,
  back,
  flipped,
  height,
}: {
  readonly front: ReactNode;
  readonly back: ReactNode;
  readonly flipped: boolean;
  /** The card's own height (the front). */
  readonly height: number;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  const [backHeight, setBackHeight] = useState(height);
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: flipped ? 1 : 0,
      duration: reduced ? FLIP_REDUCED_MS : FLIP_MS,
      easing: reduced ? Easing.linear : RISE,
      useNativeDriver: true,
    });
    // A stalled turn must still leave the pass shown and readable.
    return runWithWatchdog(animation, {
      timeline: reduced ? FLIP_REDUCED_MS : FLIP_MS,
      settle: settleValues([[progress, flipped ? 1 : 0]]),
    });
  }, [flipped, progress, reduced]);

  const turn = (from: string, to: string) => ({
    transform: [
      { perspective: 1400 },
      {
        rotateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [from, to],
        }),
      },
    ],
  });
  const fade = (from: number, to: number) => ({
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [from, to],
    }),
  });
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: "no-hide-descendants" as const,
    pointerEvents: "none" as const,
  };
  return (
    <View
      style={{ height: flipped ? Math.max(height, backHeight) : height }}
      testID="card-flip"
    >
      <Animated.View
        {...(flipped ? hidden : {})}
        style={[
          styles.face,
          { height },
          reduced ? fade(1, 0) : turn("0deg", "180deg"),
        ]}
      >
        {front}
      </Animated.View>
      <Animated.View
        {...(flipped ? {} : hidden)}
        onLayout={(event) => setBackHeight(event.nativeEvent.layout.height)}
        style={[
          styles.face,
          styles.back,
          reduced ? fade(0, 1) : turn("180deg", "360deg"),
        ]}
      >
        {back}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backfaceVisibility: "hidden",
  },
  back: { minHeight: 0 },
});
