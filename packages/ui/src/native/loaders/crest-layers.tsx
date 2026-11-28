import type { ReactNode } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { CRESTS, MARK_VIEWBOX, NET } from "../../brand/geometry";
import { MARK_RATIO } from "../brand/marks";

const box = `${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`;
/** The crests grow from x = 33 (their edge on the line), brand book section 1. */
const CREST_ORIGIN = `${(((33 - MARK_VIEWBOX.x) / MARK_VIEWBOX.width) * 100).toFixed(2)}% 50%`;

type Scale = Animated.Value | Animated.AnimatedInterpolation<number> | number;

/** Outer, middle, inner (the brand book order); animations run inner first. */
export const CREST_PATHS = CRESTS;

function Layer({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: Animated.WithAnimatedValue<ViewStyle>;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <Svg height="100%" viewBox={box} width="100%">
        {children}
      </Svg>
    </Animated.View>
  );
}

/**
 * The Crest as separate layers, so each crest can grow out of the line on the
 * native driver (`scaleX` from the line edge) and the net can stand up from
 * its centre (`scaleY`).
 */
export function CrestLayers({
  height,
  color,
  net = 1,
  crests = [1, 1, 1],
  crestColors,
}: {
  readonly height: number;
  readonly color: string;
  /** scaleY of the net, from its centre. */
  readonly net?: Scale;
  /** scaleX of [outer, middle, inner], each from the line. */
  readonly crests?: readonly [Scale, Scale, Scale];
  /** Per-crest colour (set-by-set pending crests use the track colour). */
  readonly crestColors?: readonly [string, string, string];
}) {
  return (
    <View style={{ height, width: height * MARK_RATIO }}>
      {CREST_PATHS.map((d, index) => (
        <Layer
          key={d}
          style={{
            transform: [{ scaleX: crests[index] as number }],
            transformOrigin: CREST_ORIGIN,
          }}
        >
          <Path d={d} fill={crestColors?.[index] ?? color} />
        </Layer>
      ))}
      <Layer style={{ transform: [{ scaleY: net as number }] }}>
        <Rect
          fill={color}
          height={NET.height}
          width={NET.width}
          x={NET.x}
          y={NET.y}
        />
      </Layer>
    </View>
  );
}
