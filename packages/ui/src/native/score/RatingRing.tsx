import {
  RATING_RING_GEOMETRY,
  ratingRingArcPath,
  ratingRingLabel,
  ratingRingLayout,
  ratingRingModel,
  type RatingChip,
  type RatingRingModel,
} from "@duna/tideline-core";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { tokenEasing } from "../motion/easing";
import { useReducedMotion } from "../motion/reduced-motion";
import { useTheme } from "../theme/ThemeProvider";
import type { NativeColorRole } from "../tokens";
import { Text } from "../type/Text";

/** Named sizes, as on the web: profile hero 260, card 120, inline 40 pt. */
export type RatingRingSize = "hero" | "card" | "inline" | number;

const NAMED_SIZES = { hero: 260, card: 120, inline: 40 } as const;
/** The arc Rises from where it was (brand book: 900 ms). */
export const RATING_RING_RISE_MS = 900;

export interface RatingRingProps {
  /** The Sand Rating, or `null` while provisional. */
  readonly value: number | null;
  /** Change since the previous rating (positive is up). */
  readonly delta?: number | null;
  /** Reliability band, 0 to 3 filled segments. */
  readonly reliability: number;
  /** Matches still needed before the rating shows; > 0 is provisional. */
  readonly matchesLeft?: number;
  /** The next goal; defaults to the next half point. */
  readonly goal?: number;
  readonly size?: RatingRingSize;
  /** What the number is. "Sand Rating" is always two words. */
  readonly label?: string;
  readonly locale?: string;
  /** Rise from the previous value on first show. Default on; off under reduced motion. */
  readonly animate?: boolean;
  readonly testID?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The chip's words, the same as the web ring. Pure. */
export function ratingChipText(chip: RatingChip): string {
  if (chip.kind === "delta")
    return `${chip.direction === "up" ? "▲" : "▼"} ${chip.text}`;
  if (chip.kind === "reached") return `Reached ${chip.goalText}`;
  return `${chip.count} more ${chip.count === 1 ? "match" : "matches"}`;
}

function chipTones(chip: RatingChip): {
  readonly fill: NativeColorRole;
  readonly ink: NativeColorRole;
} {
  if (chip.kind === "delta") {
    return chip.direction === "up"
      ? { fill: "positive-wash", ink: "positive" }
      : { fill: "danger-wash", ink: "danger" };
  }
  if (chip.kind === "reached") return { fill: "sun-wash", ink: "sun-ink" };
  return { fill: "surface-sunken", ink: "text-2" };
}

/** The resolved model and layout for a ring, shared with tests. Pure. */
export function ratingRingView(
  props: Pick<
    RatingRingProps,
    "value" | "delta" | "reliability" | "matchesLeft" | "goal" | "label"
  > & { readonly px: number; readonly locale: string },
): {
  readonly model: RatingRingModel;
  readonly layout: ReturnType<typeof ratingRingLayout>;
  readonly accessibilityLabel: string;
} {
  const model = ratingRingModel({
    value: props.value,
    delta: props.delta,
    reliability: props.reliability,
    matchesLeft: props.matchesLeft,
    goal: props.goal,
    locale: props.locale,
  });
  return {
    model,
    layout: ratingRingLayout(props.px),
    accessibilityLabel: ratingRingLabel(model, {
      label: props.label ?? "Sand Rating",
      locale: props.locale,
    }),
  };
}

/**
 * The two-ring Sand Rating for React Native (brand book section 4): the
 * progress arc on its track, the three-segment reliability band inside it,
 * and the number and change chip. Geometry, states and the spoken label come
 * from `@duna/tideline-core`, so it draws exactly what the web ring draws.
 *
 * The goal tick is a neutral line, not Solar (Solar is for live states; the
 * brand book's Solar tick is an open owner question). The ring is one image
 * to VoiceOver with the full sentence ("Sand Rating 3.42, up 0.08. 84% of the
 * way to 3.50. Reliability 3 of 3."). The arc Rises from its previous value
 * once; reduced motion shows the end state.
 */
export function RatingRing({
  value,
  delta,
  reliability,
  matchesLeft,
  goal,
  size = "card",
  label = "Sand Rating",
  locale = "en-US",
  animate = true,
  testID,
}: RatingRingProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const px = typeof size === "number" ? size : NAMED_SIZES[size];
  const { model, layout, accessibilityLabel } = ratingRingView({
    value,
    delta,
    reliability,
    matchesLeft,
    goal,
    label,
    px,
    locale,
  });
  const { track, band, tick, viewBox } = RATING_RING_GEOMETRY;
  const center = viewBox / 2;
  const arcStroke = layout.arcStroke ?? track.stroke;
  const circumference = 2 * Math.PI * track.radius;
  const moving = animate && !reduceMotion;
  const progress = useRef(
    new Animated.Value(
      moving ? model.progressFrom.fraction : model.progress.fraction,
    ),
  ).current;

  useEffect(() => {
    if (!moving) {
      progress.setValue(model.progress.fraction);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: model.progress.fraction,
      duration: RATING_RING_RISE_MS,
      easing: tokenEasing("out"),
      // strokeDashoffset is not a native-driver property.
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [model.progress.fraction, moving, progress]);

  const number = model.label.number ?? "—";
  const chip = model.label.chip;
  const chipStyle = chip ? chipTones(chip) : null;
  const numberSize = (layout.numberScale ?? 0.25) * px;

  const chipNode =
    chip && chipStyle ? (
      <View style={[styles.chip, { backgroundColor: colors[chipStyle.fill] }]}>
        <Text
          numberOfLines={1}
          tabular
          tone={chipStyle.ink}
          variant="micro"
          weight={600}
        >
          {ratingChipText(chip)}
        </Text>
      </View>
    ) : null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessible
      style={styles.root}
      testID={testID}
    >
      <View style={{ width: px, height: px }}>
        <Svg
          height={px}
          style={{ opacity: model.opacity }}
          viewBox={`0 0 ${viewBox} ${viewBox}`}
          width={px}
        >
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={track.radius}
            stroke={model.dotted ? colors["text-3"] : colors["surface-sunken"]}
            strokeDasharray={model.dotted ? "1 9" : undefined}
            strokeLinecap={model.dotted ? "round" : "butt"}
            strokeWidth={arcStroke}
          />
          {model.progress.fraction > 0 ? (
            <AnimatedCircle
              cx={center}
              cy={center}
              fill="none"
              r={track.radius}
              stroke={colors.action}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={progress.interpolate({
                inputRange: [0, 1],
                outputRange: [circumference, 0],
              })}
              strokeLinecap="butt"
              strokeWidth={arcStroke}
              transform={`rotate(-90 ${center} ${center})`}
            />
          ) : null}
          {layout.showBand
            ? model.band.map((segment, index) => (
                <Path
                  d={ratingRingArcPath(
                    segment.startDeg,
                    segment.endDeg,
                    band.radius,
                  )}
                  fill="none"
                  key={index}
                  stroke={
                    segment.filled ? colors.sun : colors["surface-sunken"]
                  }
                  strokeWidth={band.stroke}
                />
              ))
            : null}
          {layout.showTick && model.goal !== null ? (
            <Line
              stroke={colors["line-strong"]}
              strokeWidth={tick.stroke}
              x1={center}
              x2={center}
              y1={tick.y1}
              y2={tick.y2}
            />
          ) : null}
        </Svg>
        {layout.showNumber ? (
          <View pointerEvents="none" style={styles.inside}>
            {layout.showLabel ? (
              <Text numberOfLines={1} tone="text-2" variant="phone-meta">
                {label}
              </Text>
            ) : null}
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={{ fontSize: numberSize, lineHeight: numberSize * 1.1 }}
              tabular
              variant="figure"
              weight={600}
            >
              {number}
            </Text>
            {layout.showChip ? chipNode : null}
          </View>
        ) : null}
      </View>
      {!layout.showNumber ? (
        <View style={styles.beside}>
          <Text tabular variant="figure-sm" weight={600}>
            {number}
          </Text>
          {chipNode}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: 8 },
  inside: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  beside: { gap: 4 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "center",
  },
});
