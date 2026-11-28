import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { MARK_RATIO } from "../brand/marks";
import { useReducedMotion } from "../motion/reduced-motion";
import { nativeTokens } from "../tokens";
import { CrestLayers } from "./crest-layers";
import { flipStartsAt, LAUNCH } from "./launch";
import { DrawnWordmark } from "./loaders";

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const MARK_HEIGHT = 112;

/**
 * The first-open sequence (cold start only; mount it once at the app root
 * over the first screen): a Night Court screen, the line stands up, the
 * crests rise, the wordmark draws on beneath, then the layer turns from its
 * left edge like a page, revealing Home underneath. Tap to skip. Reduced
 * motion: the finished lockup, then a 200 ms cross-fade.
 *
 * Pass `ready` when the app can tell that Home has loaded: the page then
 * waits for it (holding on the finished mark) and may turn early, once the
 * crests have landed. Without it, the full 3.5 s sequence plays.
 */
export function LaunchSequence({
  onComplete,
  ready,
  label = "Opening Duna",
}: {
  readonly onComplete: () => void;
  readonly ready?: boolean;
  readonly label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { brand } = nativeTokens;
  const net = useRef(new Animated.Value(0)).current;
  const crests = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const start = useRef(Date.now()).current;
  const [readyAt, setReadyAt] = useState<number | null | undefined>(
    ready === undefined ? undefined : ready ? 0 : null,
  );
  const [skippedAt, setSkippedAt] = useState<number | null>(null);
  const done = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    if (ready && readyAt === null) setReadyAt(Date.now() - start);
  }, [ready, readyAt, start]);

  // Build the mark and the wordmark.
  useEffect(() => {
    if (reduceMotion) {
      net.setValue(1);
      for (const crest of crests) crest.setValue(1);
      wordmark.setValue(1);
      return;
    }
    const build = Animated.parallel([
      Animated.timing(net, {
        toValue: 1,
        delay: LAUNCH.net.at,
        duration: LAUNCH.net.duration,
        easing: ease,
        useNativeDriver: true,
      }),
      // Inner (index 2) first, then middle, then outer.
      ...[2, 1, 0].map((crest, order) =>
        Animated.timing(crests[crest]!, {
          toValue: 1,
          delay: LAUNCH.crests.at + order * LAUNCH.crests.stagger,
          duration: LAUNCH.crests.duration,
          easing: ease,
          useNativeDriver: true,
        }),
      ),
      Animated.timing(wordmark, {
        toValue: 1,
        delay: LAUNCH.wordmark.at,
        duration: LAUNCH.wordmark.duration,
        easing: ease,
        useNativeDriver: false,
      }),
    ]);
    build.start();
    return () => build.stop();
  }, [crests, net, reduceMotion, wordmark]);

  // Turn the page (or cross-fade) when the timeline says so.
  const flipAt = flipStartsAt({ readyAt, skippedAt });
  useEffect(() => {
    if (flipAt === null) return;
    const finish = () => {
      if (done.current) return;
      done.current = true;
      completeRef.current();
    };
    // Reduced motion holds the finished lockup briefly instead of the
    // nominal timeline; a skip or a ready Home still ends it at once.
    const target = reduceMotion
      ? skippedAt !== null
        ? skippedAt
        : flipAt === LAUNCH.flip.at
          ? LAUNCH.reduced.hold
          : Math.max(LAUNCH.reduced.hold, flipAt)
      : flipAt;
    const wait = Math.max(0, target - (Date.now() - start));
    const animation = Animated.timing(flip, {
      toValue: 1,
      delay: wait,
      duration: reduceMotion ? LAUNCH.reduced.fade : LAUNCH.flip.duration,
      easing: reduceMotion ? Easing.linear : Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) finish();
    });
    return () => animation.stop();
  }, [flip, flipAt, reduceMotion, skippedAt, start]);

  const markWidth = MARK_HEIGHT * MARK_RATIO;
  const layer = reduceMotion
    ? { opacity: flip.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : {
        transform: [
          { perspective: LAUNCH.flip.perspective },
          {
            rotateY: flip.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", `${LAUNCH.flip.toDegrees}deg`],
            }),
          },
        ],
        transformOrigin: "0% 50%",
        backfaceVisibility: "hidden" as const,
      };

  return (
    <Animated.View
      pointerEvents={skippedAt === null ? "auto" : "none"}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: brand["night-court"] },
        layer,
      ]}
      testID="duna-launch-sequence"
    >
      <StatusBar barStyle="light-content" />
      <Pressable
        accessibilityHint="Skips the opening animation"
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => setSkippedAt((current) => current ?? Date.now() - start)}
        style={styles.fill}
      >
        <View style={{ alignItems: "center", gap: MARK_HEIGHT * 0.17 }}>
          <CrestLayers
            color={brand.dune}
            crests={[crests[0]!, crests[1]!, crests[2]!]}
            height={MARK_HEIGHT}
            net={net}
          />
          <DrawnWordmark
            color={brand.salt}
            progress={wordmark}
            width={markWidth}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { alignItems: "center", flex: 1, justifyContent: "center" },
});
