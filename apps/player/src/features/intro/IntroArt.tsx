/**
 * The drawn art at the top of each intro (owner feedback 28 Nov: "beautiful
 * animations", "no stock icons"). Each piece is built from the brand's own
 * shapes on its ground: court lines and the Crest for Find and Play, rising
 * bars for the Sand Rating, fanned club cards for the wallet, the person and
 * their three sections for the profile. Everything enters once on the Rise
 * curve, staggered like Rally, through `runWithWatchdog`; the art only
 * decorates (VoiceOver skips it) and the words beside it never wait on it.
 * Reduced motion: the art is simply there.
 */
import { useEffect, useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import {
  CrestLayers,
  DunaMark,
  rallyDelay,
  runWithWatchdog,
  tokenEasing,
  useReducedMotion,
  useTheme,
  verbTiming,
} from "@duna/ui/native";
import type { IntroGround, IntroKey } from "./intro-content";

export const ART_WIDTH = 240;
export const ART_HEIGHT = 168;

/** The fill for a brand ground. */
export function useGroundColors(ground: IntroGround): {
  readonly fill: string;
  readonly ink: string;
  readonly soft: string;
  readonly accent: string;
} {
  const { tokens } = useTheme();
  const salt = tokens.brand.salt;
  const night = tokens.brand["night-court"];
  switch (ground) {
    case "night-court":
      return {
        fill: night,
        ink: salt,
        soft: "rgba(244,242,236,0.16)",
        accent: tokens.brand.dune,
      };
    case "tidewater":
      return {
        fill: tokens.ramp["tideblue-600"],
        ink: salt,
        soft: "rgba(244,242,236,0.22)",
        accent: tokens.brand.dune,
      };
    case "hardwood":
      return {
        fill: tokens.brand.hardwood,
        ink: night,
        soft: "rgba(14,26,34,0.16)",
        accent: salt,
      };
    case "dune":
      return {
        fill: tokens.brand.dune,
        ink: night,
        soft: "rgba(14,26,34,0.14)",
        accent: tokens.brand.hardwood,
      };
  }
}

/**
 * `count` values that each go 0 → 1 once, staggered like Rally, on the Rise
 * curve. Under reduced motion they start at 1. A new `trigger` replays them.
 */
function useEntrance(count: number, trigger: unknown) {
  const reduceMotion = useReducedMotion();
  const values = useMemo(
    () => Array.from({ length: count }, () => new Animated.Value(0)),
    [count],
  );
  useEffect(() => {
    if (reduceMotion) {
      for (const value of values) value.setValue(1);
      return;
    }
    const timing = verbTiming("rise", false);
    const cancels = values.map((value, index) => {
      value.setValue(0);
      const delay = 120 + rallyDelay(index, false);
      return runWithWatchdog(
        Animated.timing(value, {
          toValue: 1,
          duration: timing.duration,
          delay,
          easing: tokenEasing("rise"),
          useNativeDriver: true,
        }),
        {
          timeline: delay + timing.duration,
          settle: () => value.setValue(1),
        },
      );
    });
    return () => {
      for (const cancel of cancels) cancel();
    };
  }, [reduceMotion, trigger, values]);
  return values;
}

const lift = (value: Animated.Value, distance = 14) => ({
  opacity: value,
  transform: [
    {
      translateY: value.interpolate({
        inputRange: [0, 1],
        outputRange: [distance, 0],
      }),
    },
  ],
});

function FindArt({ trigger, ground }: ArtProps) {
  const colors = useGroundColors(ground);
  const [court, net, pinA, pinB, pinC] = useEntrance(5, trigger) as [
    Animated.Value,
    Animated.Value,
    Animated.Value,
    Animated.Value,
    Animated.Value,
  ];
  const pin = (value: Animated.Value, left: number, top: number, size = 34) => (
    <Animated.View
      style={[styles.abs, { left, top }, lift(value, 22)]}
      testID="intro-art-pin"
    >
      <View
        style={[
          styles.pin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accent,
          },
        ]}
      >
        <DunaMark color={colors.fill} decorative size={size * 0.5} />
      </View>
      <View style={[styles.pinStem, { backgroundColor: colors.accent }]} />
    </Animated.View>
  );
  return (
    <View style={styles.canvas}>
      <Animated.View
        style={[
          styles.abs,
          { left: 30, top: 34 },
          {
            opacity: court,
            transform: [
              {
                scale: court.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Svg height={110} width={180}>
          <Rect
            fill={colors.soft}
            height={104}
            stroke={colors.ink}
            strokeWidth={2}
            width={174}
            x={3}
            y={3}
          />
          <Line
            stroke={colors.ink}
            strokeDasharray="4 6"
            strokeWidth={1.5}
            x1={3}
            x2={177}
            y1={30}
            y2={30}
          />
          <Line
            stroke={colors.ink}
            strokeDasharray="4 6"
            strokeWidth={1.5}
            x1={3}
            x2={177}
            y1={80}
            y2={80}
          />
        </Svg>
      </Animated.View>
      <Animated.View
        style={[
          styles.abs,
          {
            left: 30,
            top: 87,
            width: 180,
            height: 4,
            backgroundColor: colors.ink,
            transform: [{ scaleX: net }],
          },
        ]}
      />
      {pin(pinA, 52, 16)}
      {pin(pinB, 150, 44, 40)}
      {pin(pinC, 96, 96, 30)}
    </View>
  );
}

function PlayArt({ trigger, ground }: ArtProps) {
  const colors = useGroundColors(ground);
  const [net, outer, middle, inner, left, right] = useEntrance(6, trigger) as [
    Animated.Value,
    Animated.Value,
    Animated.Value,
    Animated.Value,
    Animated.Value,
    Animated.Value,
  ];
  const score = (
    value: Animated.Value,
    side: "left" | "right",
    bars: number,
  ) => (
    <Animated.View
      style={[
        styles.scoreColumn,
        side === "left" ? { left: 14 } : { right: 14 },
        lift(value),
      ]}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.scoreDot,
            {
              backgroundColor: index < bars ? colors.accent : "transparent",
              borderColor: colors.accent,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
  return (
    <View style={[styles.canvas, styles.center]}>
      <CrestLayers
        color={colors.accent}
        crests={[outer, middle, inner]}
        height={120}
        net={net}
      />
      {score(left, "left", 2)}
      {score(right, "right", 1)}
    </View>
  );
}

function RatingArt({ trigger, ground }: ArtProps) {
  const colors = useGroundColors(ground);
  const heights = [36, 52, 46, 74, 96];
  const values = useEntrance(heights.length + 1, trigger);
  const marker = values[heights.length]!;
  return (
    <View style={styles.canvas}>
      <View style={styles.bars}>
        {heights.map((height, index) => (
          <Animated.View
            key={height}
            style={[
              styles.bar,
              {
                height,
                backgroundColor:
                  index === heights.length - 1 ? colors.ink : colors.soft,
                borderColor: colors.ink,
                transform: [{ scaleY: values[index]! }],
                transformOrigin: "50% 100%",
              },
            ]}
          />
        ))}
      </View>
      <Animated.View
        style={[
          styles.abs,
          { left: 168, top: 12 },
          {
            opacity: marker,
            transform: [
              {
                scale: marker.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Svg height={36} width={36}>
          <Circle cx={18} cy={18} fill={colors.accent} r={14} />
          <Circle
            cx={18}
            cy={18}
            fill="none"
            r={17}
            stroke={colors.ink}
            strokeWidth={1.5}
          />
        </Svg>
      </Animated.View>
      <View style={[styles.baseline, { backgroundColor: colors.ink }]} />
    </View>
  );
}

function WalletArt({ trigger, ground }: ArtProps) {
  const colors = useGroundColors(ground);
  const { tokens } = useTheme();
  const cards = [
    { fill: tokens.ramp["tideblue-600"], ink: tokens.brand.salt, angle: -14 },
    { fill: tokens.brand.hardwood, ink: tokens.brand["night-court"], angle: 0 },
    {
      fill: tokens.brand["night-court"],
      ink: tokens.brand.dune,
      angle: 14,
    },
  ];
  const values = useEntrance(cards.length, trigger);
  return (
    <View style={[styles.canvas, styles.center]}>
      {cards.map((card, index) => {
        const value = values[index]!;
        return (
          <Animated.View
            key={card.angle}
            style={[
              styles.card,
              {
                backgroundColor: card.fill,
                borderColor: colors.soft,
                opacity: value,
                transform: [
                  {
                    translateX: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, card.angle * 2.4],
                    }),
                  },
                  {
                    rotate: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", `${card.angle}deg`],
                    }),
                  },
                ],
              },
            ]}
          >
            <DunaMark color={card.ink} decorative size={22} />
            <View style={[styles.cardStripe, { backgroundColor: card.ink }]} />
          </Animated.View>
        );
      })}
    </View>
  );
}

function ProfileArt({ trigger, ground }: ArtProps) {
  const colors = useGroundColors(ground);
  const { tokens } = useTheme();
  const [centre, a, b, c] = useEntrance(4, trigger) as [
    Animated.Value,
    Animated.Value,
    Animated.Value,
    Animated.Value,
  ];
  const tile = (value: Animated.Value, fill: string, style: object) => (
    <Animated.View
      style={[styles.tile, { backgroundColor: fill }, style, lift(value)]}
    />
  );
  return (
    <View style={[styles.canvas, styles.center]}>
      {tile(a, tokens.ramp["tideblue-600"], { left: 20, top: 92 })}
      {tile(b, tokens.brand.hardwood, { right: 20, top: 92 })}
      {tile(c, tokens.brand.dune, { left: 96, top: 116 })}
      <Animated.View
        style={[
          styles.avatarRing,
          {
            borderColor: colors.accent,
            backgroundColor: colors.soft,
            opacity: centre,
            transform: [
              {
                scale: centre.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.86, 1],
                }),
              },
            ],
          },
        ]}
      >
        <DunaMark color={colors.accent} decorative size={40} />
      </Animated.View>
    </View>
  );
}

interface ArtProps {
  readonly trigger: unknown;
  readonly ground: IntroGround;
}

const ART: Record<IntroKey, (props: ArtProps) => React.JSX.Element> = {
  find: FindArt,
  play: PlayArt,
  rating: RatingArt,
  wallet: WalletArt,
  profile: ProfileArt,
};

export function IntroArt({
  intro,
  ground,
  trigger,
}: {
  readonly intro: IntroKey;
  readonly ground: IntroGround;
  /** Replays the entrance (the page became the visible one). */
  readonly trigger?: unknown;
}) {
  const Art = ART[intro];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
      testID={`intro-art-${intro}`}
    >
      <Art ground={ground} trigger={trigger} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  canvas: { width: ART_WIDTH, height: ART_HEIGHT },
  center: { alignItems: "center", justifyContent: "center" },
  abs: { position: "absolute" },
  pin: { alignItems: "center", justifyContent: "center" },
  pinStem: { width: 2, height: 10, alignSelf: "center" },
  scoreColumn: {
    position: "absolute",
    top: 46,
    gap: 10,
  },
  scoreDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  bars: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 22,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  bar: { flex: 1, borderRadius: 6, borderWidth: 1.5 },
  baseline: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    height: 2,
  },
  card: {
    position: "absolute",
    width: 112,
    height: 148,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  cardStripe: { height: 6, width: 48, borderRadius: 3 },
  tile: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  avatarRing: {
    marginBottom: 52,
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
