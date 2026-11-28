import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import {
  MICRO_CREST,
  NET,
  MARK_VIEWBOX,
  WORDMARK_SHAPES,
  WORDMARK_STROKE,
  WORDMARK_VIEWBOX,
} from "../../brand/geometry";
import { MARK_RATIO, useMarkColor } from "../brand/marks";
import { useReducedMotion } from "../motion/reduced-motion";
import { useTheme } from "../theme/ThemeProvider";
import { nativeTokens } from "../tokens";
import { Text } from "../type/Text";
import { CrestLayers } from "./crest-layers";
import { useLoop } from "./use-loop";

const { duration } = nativeTokens.motion;
const native = true;

/** Rally loader timing (brand book section 6): 1.4 s loop, 150 ms apart. */
export const RALLY_LOADER = { loop: 1400, stagger: 150, rest: 0.35 } as const;

function Caption({ label }: { readonly label?: string }) {
  if (!label) return null;
  return (
    <Text
      style={{ marginTop: 12, textAlign: "center" }}
      tone="text-2"
      variant="phone-meta"
    >
      {label}
    </Text>
  );
}

/**
 * Rally (the default wait): three crests swell from the line in turn, inner
 * to outer. Reduced motion: the resting mark.
 */
export function RallyLoader({
  size = 32,
  label,
  color,
  accessibilityLabel = label ?? "Loading",
}: {
  readonly size?: number;
  readonly label?: string;
  readonly color?: string;
  readonly accessibilityLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const fallback = useMarkColor();
  const ink = color ?? fallback;
  const crests = useRef([0, 1, 2].map(() => new Animated.Value(1))).current;
  const { loop, stagger, rest } = RALLY_LOADER;
  const swell = (loop - 2 * stagger) / 2;
  useLoop(
    () =>
      Animated.parallel(
        // Inner (index 2) first, then middle, then outer.
        [2, 1, 0].map((crest, order) =>
          Animated.sequence([
            Animated.timing(crests[crest]!, {
              toValue: rest,
              duration: 0,
              useNativeDriver: native,
            }),
            Animated.delay(order * stagger),
            Animated.timing(crests[crest]!, {
              toValue: 1,
              duration: swell / 2,
              easing: Easing.bezier(0.2, 0.8, 0.2, 1),
              useNativeDriver: native,
            }),
            Animated.timing(crests[crest]!, {
              toValue: rest,
              duration: swell / 2,
              easing: Easing.bezier(0.4, 0, 1, 1),
              useNativeDriver: native,
            }),
            Animated.delay(loop - swell - order * stagger),
          ]),
        ),
      ),
    !reduceMotion,
    [crests],
  );
  useEffect(() => {
    if (reduceMotion) for (const crest of crests) crest.setValue(1);
  }, [crests, reduceMotion]);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessible
      style={styles.center}
    >
      <CrestLayers
        color={ink}
        crests={[crests[0]!, crests[1]!, crests[2]!]}
        height={size}
      />
      <Caption label={label} />
    </View>
  );
}

/** The swelling Crest at 16 / 24 pt (replaces the round spinner). */
export function Spinner({
  size = "sm",
  color,
  label = "Loading",
}: {
  readonly size?: "xs" | "sm" | "lg";
  readonly color?: string;
  readonly label?: string;
}) {
  const px = size === "xs" ? 12 : size === "sm" ? 16 : 24;
  return <ButtonLoader color={color} label={label} size={px} />;
}

/**
 * In the button: the micro mark with its crest swelling. Keeps the button's
 * width; Dune on the primary button (pass `color`).
 */
export function ButtonLoader({
  size = 16,
  color,
  label = "Working",
}: {
  readonly size?: number;
  readonly color?: string;
  readonly label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const fallback = useMarkColor();
  const ink = color ?? fallback;
  const swell = useRef(new Animated.Value(1)).current;
  useLoop(
    () =>
      Animated.sequence([
        Animated.timing(swell, {
          toValue: 0.35,
          duration: 520,
          easing: Easing.bezier(0.4, 0, 1, 1),
          useNativeDriver: native,
        }),
        Animated.timing(swell, {
          toValue: 1,
          duration: 520,
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: native,
        }),
        Animated.delay(360),
      ]),
    !reduceMotion,
    [swell],
  );
  useEffect(() => {
    if (reduceMotion) swell.setValue(1);
  }, [reduceMotion, swell]);
  const box = `${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`;
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessible
      style={{ height: size, width: size * MARK_RATIO }}
    >
      <Svg
        height="100%"
        style={StyleSheet.absoluteFill}
        viewBox={box}
        width="100%"
      >
        <Path
          d={`M${NET.x} ${NET.y}h${NET.width}v${NET.height}h-${NET.width}Z`}
          fill={ink}
        />
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ scaleX: swell }], transformOrigin: "28.81% 50%" },
        ]}
      >
        <Svg height="100%" viewBox={box} width="100%">
          <Path d={MICRO_CREST} fill={ink} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * The live indicator: a Solar Crest swelling from its line, with its word.
 * The only Solar component (contract R5); it loops only while live.
 */
export function LiveCrest({ label = "Live" }: { readonly label?: string }) {
  const { colors, tokens } = useTheme();
  return (
    <View
      accessibilityLabel={label}
      accessible
      style={[styles.liveChip, { backgroundColor: colors["live-wash"] }]}
    >
      <ButtonLoader color={tokens.brand.solar} label={label} size={14} />
      <Text tone="live-ink" variant="micro" weight={600}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Crossing (searching and matching): a ball arcs over the net line, there
 * and back. Reduced motion: the ball at rest above the net.
 */
export function CrossingLoader({
  size = 48,
  label,
}: {
  readonly size?: number;
  readonly label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0.5)).current;
  useLoop(
    () =>
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 0,
          useNativeDriver: native,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: native,
        }),
        Animated.timing(progress, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: native,
        }),
      ]),
    !reduceMotion,
    [progress],
  );
  useEffect(() => {
    if (reduceMotion) progress.setValue(0.5);
  }, [progress, reduceMotion]);
  const width = size * 2;
  const ball = Math.max(8, size * 0.2);
  return (
    <View
      accessibilityLabel={label ?? "Searching"}
      accessibilityRole="progressbar"
      accessible
      style={styles.center}
    >
      <View style={{ width, height: size }}>
        <View
          style={{
            position: "absolute",
            left: width / 2 - 1,
            bottom: 0,
            width: 2,
            height: size * 0.55,
            backgroundColor: colors.text,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            left: width / 2 - ball / 2,
            bottom: size * 0.55 - ball / 2,
            width: ball,
            height: ball,
            borderRadius: ball / 2,
            backgroundColor: colors.sun,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-width / 2 + ball / 2, width / 2 - ball / 2],
                }),
              },
              {
                translateY: progress.interpolate({
                  inputRange: [0, 0.25, 0.5, 0.75, 1],
                  outputRange: [0, -size * 0.3, -size * 0.4, -size * 0.3, 0],
                }),
              },
            ],
          }}
        />
      </View>
      <Caption label={label} />
    </View>
  );
}

/**
 * Set by set (known steps, at most three): one crest fills per completed
 * step, inner first, each Rising from the line as it completes.
 */
export function SetBySetLoader({
  steps = 3,
  done,
  size = 40,
  label,
}: {
  readonly steps?: 1 | 2 | 3;
  readonly done: number;
  readonly size?: number;
  readonly label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const { colors } = useTheme();
  const ink = useMarkColor();
  // Crest order outer, middle, inner; steps fill inner first.
  const filled = (crest: number) => {
    const step = 2 - crest;
    return step < steps && step < done;
  };
  const scales = useRef(
    [0, 1, 2].map((crest) => new Animated.Value(crest >= 0 ? 1 : 0)),
  ).current;
  const previous = useRef(done);
  useEffect(() => {
    for (let crest = 0; crest < 3; crest += 1) {
      const step = 2 - crest;
      if (step >= previous.current && step < done && !reduceMotion) {
        scales[crest]!.setValue(0);
        Animated.timing(scales[crest]!, {
          toValue: 1,
          duration: duration.rise,
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: native,
        }).start();
      }
    }
    previous.current = done;
  }, [done, reduceMotion, scales]);
  const colorsFor = [0, 1, 2].map((crest) =>
    2 - crest >= steps
      ? "transparent"
      : filled(crest)
        ? ink
        : colors["line-strong"],
  ) as [string, string, string];
  return (
    <View
      accessibilityLabel={label ?? `Step ${Math.min(done, steps)} of ${steps}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: steps, now: Math.min(done, steps) }}
      accessible
      style={styles.center}
    >
      <CrestLayers
        color={ink}
        crestColors={colorsFor}
        crests={[scales[0]!, scales[1]!, scales[2]!]}
        height={size}
      />
      <Caption label={label} />
    </View>
  );
}

/**
 * Pull to refresh (lists): the line follows the finger (`progress` 0..1), and
 * the crests pop on release (`refreshing`).
 */
export function PullToRefreshIndicator({
  progress,
  refreshing,
  size = 28,
}: {
  readonly progress: number | Animated.Value;
  readonly refreshing: boolean;
  readonly size?: number;
}) {
  const ink = useMarkColor();
  const reduceMotion = useReducedMotion();
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!refreshing) {
      pop.setValue(0);
      return;
    }
    if (reduceMotion) {
      pop.setValue(1);
      return;
    }
    Animated.timing(pop, {
      toValue: 1,
      duration: duration.rise,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: native,
    }).start();
  }, [pop, reduceMotion, refreshing]);
  const crest = (from: number) =>
    pop.interpolate({
      inputRange: [from, Math.min(1, from + 0.5), 1],
      outputRange: [0, 1, 1],
      extrapolate: "clamp",
    });
  return (
    <View
      accessibilityLabel={refreshing ? "Refreshing" : "Pull to refresh"}
      accessibilityRole="progressbar"
      accessible
      style={[styles.center, { height: size + 16 }]}
    >
      {refreshing ? (
        <CrestLayers
          color={ink}
          crests={[crest(0.24), crest(0.12), crest(0)]}
          height={size}
        />
      ) : (
        <CrestLayers
          color={ink}
          crests={[0, 0, 0]}
          height={size}
          net={
            typeof progress === "number"
              ? Math.min(1, Math.max(0, progress))
              : progress
          }
        />
      )}
    </View>
  );
}

/** Tide sweep (background refresh at the top): a glint along a hairline. */
export function TideSweep({ active = true }: { readonly active?: boolean }) {
  const { colors, scheme, tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useLoop(
    () =>
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 0,
          duration: 0,
          useNativeDriver: native,
        }),
        Animated.timing(sweep, {
          toValue: 1,
          duration: duration.wave,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: native,
        }),
      ]),
    active && !reduceMotion && width > 0,
    [sweep, width],
  );
  return (
    <View
      accessibilityElementsHidden={!active}
      accessibilityLabel={active ? "Refreshing" : undefined}
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
      style={{ height: 2, overflow: "hidden", backgroundColor: colors.line }}
    >
      {active && !reduceMotion ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: Math.max(48, width * 0.24),
            backgroundColor:
              scheme === "dark" ? tokens.brand.dune : colors.text,
            opacity: 0.7,
            transform: [
              {
                translateX: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-Math.max(48, width * 0.24), width],
                }),
              },
            ],
          }}
        />
      ) : null}
    </View>
  );
}

export type SkeletonKind = "lines" | "row" | "block" | "avatar" | "card";

/**
 * Sand shimmer (first load of lists and cards): `surface-sunken` blocks in the
 * final layout's geometry with a Salt glint, 1.6 s. Reduced motion: still.
 */
export function Skeleton({
  kind = "lines",
  count = 3,
  label = "Loading",
  style,
}: {
  readonly kind?: SkeletonKind;
  readonly count?: number;
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { colors, tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const glint = useRef(new Animated.Value(0)).current;
  useLoop(
    () =>
      Animated.sequence([
        Animated.timing(glint, {
          toValue: 0,
          duration: 0,
          useNativeDriver: native,
        }),
        Animated.timing(glint, {
          toValue: 1,
          duration: 1600,
          easing: Easing.linear,
          useNativeDriver: native,
        }),
      ]),
    !reduceMotion,
    [glint],
  );
  const block = (key: string, blockStyle: ViewStyle) => (
    <View
      key={key}
      style={[
        {
          backgroundColor: colors["surface-sunken"],
          overflow: "hidden",
          borderRadius: tokens.radius.md,
        },
        blockStyle,
      ]}
    >
      {reduceMotion ? null : (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "40%",
            backgroundColor: tokens.brand.salt,
            opacity: glint.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 0.55, 0],
            }),
            transform: [
              {
                translateX: glint.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-160, 420],
                }),
              },
            ],
          }}
        />
      )}
    </View>
  );
  const items = Array.from({ length: count }, (_, index) => index);
  const space = tokens.space;
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessible
      style={[{ gap: space["3"] }, style]}
    >
      {kind === "lines" &&
        items.map((index) =>
          block(`l${index}`, {
            height: 14,
            width: index === count - 1 ? "62%" : "100%",
          }),
        )}
      {kind === "row" &&
        items.map((index) => (
          <View
            key={`r${index}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space["3"],
            }}
          >
            {block("a", { width: 40, height: 40, borderRadius: 20 })}
            <View style={{ flex: 1, gap: space["2"] }}>
              {block("t", { height: 14, width: "70%" })}
              {block("m", { height: 12, width: "45%" })}
            </View>
          </View>
        ))}
      {kind === "block" &&
        items.map((index) => block(`b${index}`, { height: 120 }))}
      {kind === "avatar" &&
        block("av", { width: 48, height: 48, borderRadius: 24 })}
      {kind === "card" &&
        items.map((index) => (
          <View
            key={`c${index}`}
            style={{
              backgroundColor: colors.surface,
              borderRadius: tokens.radius["card-comfort"],
              padding: space["4"],
              gap: space["3"],
            }}
          >
            {block("p", { height: 96 })}
            {block("t", { height: 16, width: "60%" })}
            {block("m", { height: 12, width: "40%" })}
          </View>
        ))}
    </View>
  );
}

/** Wordmark stroke lengths, per drawn segment, so each draws at one speed. */
const WORDMARK_SEGMENTS: ReadonlyArray<{ d: string; length: number }> = [
  { d: "M55.5 0V100", length: 100 },
  { d: "M86.5 40V70A25.5 25.5 0 0 0 137.5 70", length: 30 + Math.PI * 25.5 },
  { d: "M137.5 40V100", length: 60 },
  { d: "M168.5 40V100", length: 60 },
  { d: "M168.5 70A25.5 25.5 0 0 1 219.5 70V100", length: 30 + Math.PI * 25.5 },
  { d: "M301.5 40V100", length: 60 },
];
const CIRCLE_LENGTH = 2 * Math.PI * 25.5;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The wordmark drawing itself on (left to right, about 1.1 s). `progress`
 * 0..1 is driven by the caller; the strokes are the brand book's.
 */
export function DrawnWordmark({
  width,
  color,
  progress,
}: {
  readonly width: number;
  readonly color: string;
  readonly progress: Animated.Value;
}) {
  const height = (width * WORDMARK_VIEWBOX.height) / WORDMARK_VIEWBOX.width;
  const count = WORDMARK_SHAPES.circles.length + WORDMARK_SEGMENTS.length;
  // Each stroke starts a little after the one to its left.
  const offset = (index: number, length: number) =>
    progress.interpolate({
      inputRange: [
        Math.min(0.6, (index / count) * 0.6),
        Math.min(1, (index / count) * 0.6 + 0.4),
      ],
      outputRange: [length, 0],
      extrapolate: "clamp",
    });
  const [first, last] = WORDMARK_SHAPES.circles;
  return (
    <Svg
      accessibilityLabel="Duna"
      accessibilityRole="image"
      accessible
      height={height}
      viewBox={`0 0 ${WORDMARK_VIEWBOX.width} ${WORDMARK_VIEWBOX.height}`}
      width={width}
    >
      <AnimatedCircle
        {...first!}
        fill="none"
        stroke={color}
        strokeDasharray={[CIRCLE_LENGTH, CIRCLE_LENGTH]}
        strokeDashoffset={offset(0, CIRCLE_LENGTH)}
        strokeWidth={WORDMARK_STROKE}
      />
      {WORDMARK_SEGMENTS.map((segment, index) => (
        <AnimatedPath
          d={segment.d}
          fill="none"
          key={segment.d}
          stroke={color}
          strokeDasharray={[segment.length, segment.length]}
          strokeDashoffset={offset(index + 1, segment.length)}
          strokeLinecap="square"
          strokeWidth={WORDMARK_STROKE}
        />
      ))}
      <AnimatedCircle
        {...last!}
        fill="none"
        stroke={color}
        strokeDasharray={[CIRCLE_LENGTH, CIRCLE_LENGTH]}
        strokeDashoffset={offset(count - 1, CIRCLE_LENGTH)}
        strokeWidth={WORDMARK_STROKE}
      />
    </Svg>
  );
}

/**
 * Serve (sign-in, long sync): full screen, the wordmark draws on, holds,
 * and draws again. Reduced motion: the finished wordmark.
 */
export function ServeLoader({
  label,
  height,
}: {
  readonly label?: string;
  readonly height?: number;
}) {
  const { colors, scheme, tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useLoop(
    () =>
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 1,
          duration: 1100,
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: false,
        }),
        Animated.delay(900),
      ]),
    !reduceMotion,
    [progress],
  );
  useEffect(() => {
    if (reduceMotion) progress.setValue(1);
  }, [progress, reduceMotion]);
  return (
    <View
      accessibilityLabel={label ?? "Loading"}
      accessibilityRole="progressbar"
      style={[styles.serve, { backgroundColor: colors.ground, height }]}
    >
      <DrawnWordmark
        color={
          scheme === "dark" ? tokens.brand.salt : tokens.brand["night-court"]
        }
        progress={progress}
        width={160}
      />
      <Caption label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  liveChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  serve: { alignItems: "center", flex: 1, justifyContent: "center" },
});
