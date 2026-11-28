import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { tokenEasing } from "./easing";
import { useReducedMotion } from "./reduced-motion";
import { rallyDelay, verbTiming } from "./timing";

export type RiseEdge = "bottom" | "top" | "left" | "right";

export interface RiseProps {
  /** The line it grows out of. Default `bottom`. */
  readonly from?: RiseEdge;
  /**
   * `grow` scales out of the line (marks, bars, progress); `lift` travels a
   * short way off the line and fades in (content, rows). Default `lift`.
   */
  readonly mode?: "grow" | "lift";
  /** Milliseconds before it starts. */
  readonly delay?: number;
  /** Replays the entrance when this value changes (a new score, a new step). */
  readonly trigger?: unknown;
  /** False: the first render is already at rest; only `trigger` changes play. */
  readonly appear?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
  readonly testID?: string;
}

const ORIGIN: Record<RiseEdge, string> = {
  bottom: "50% 100%",
  top: "50% 0%",
  left: "0% 50%",
  right: "100% 50%",
};

/** Lift distance, in points: a short travel off the line. */
const LIFT = 12;

/**
 * Rise: something grows out of a line (600 ms, the ease-out curve, once).
 * Reduced motion: the end state with a 200 ms fade.
 */
export function Rise({
  from = "bottom",
  mode = "lift",
  delay = 0,
  trigger,
  appear = true,
  style,
  children,
  testID,
}: RiseProps) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(appear ? 0 : 1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!appear) return;
    }
    const timing = verbTiming("rise", reduceMotion);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: timing.duration,
      delay,
      easing: tokenEasing("rise"),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [appear, delay, progress, reduceMotion, trigger]);

  const horizontal = from === "left" || from === "right";
  const sign = from === "bottom" || from === "right" ? 1 : -1;
  const transform = reduceMotion
    ? []
    : mode === "grow"
      ? [horizontal ? { scaleX: progress } : { scaleY: progress }]
      : [
          horizontal
            ? {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sign * LIFT, 0],
                }),
              }
            : {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [sign * LIFT, 0],
                }),
              },
        ];
  const opacity = reduceMotion || mode === "lift" ? progress : 1;

  return (
    <Animated.View
      style={[
        style,
        { opacity, transform, transformOrigin: ORIGIN[from] } as ViewStyle,
      ]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Rally: the same Rise per item, 120 ms apart, on first appearance only
 * (never on scroll). Reduced motion: one fade, no stagger.
 */
export function Rally({
  children,
  from = "bottom",
  mode = "lift",
  trigger,
  itemStyle,
}: {
  readonly children?: ReactNode;
  readonly from?: RiseEdge;
  readonly mode?: "grow" | "lift";
  readonly trigger?: unknown;
  readonly itemStyle?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <>
      {Children.toArray(children).map((child, index) => (
        <Rise
          delay={rallyDelay(index, reduceMotion)}
          from={from}
          key={(child as { key?: string }).key ?? index}
          mode={mode}
          style={itemStyle}
          trigger={trigger}
        >
          {child}
        </Rise>
      ))}
    </>
  );
}

/**
 * Cross: content travels over a line between peer views (320 ms). Change
 * `crossKey` to cross to new content; `direction` says which way it travels.
 * Reduced motion: a 200 ms fade.
 */
export function Cross({
  crossKey,
  direction = "forward",
  style,
  children,
}: {
  readonly crossKey: string | number;
  readonly direction?: "forward" | "back";
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const [width, setWidth] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timing = verbTiming("cross", reduceMotion);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: timing.duration,
      easing: tokenEasing("cross"),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [crossKey, progress, reduceMotion]);

  const distance = Math.max(48, width * 0.32);
  const sign = direction === "forward" ? 1 : -1;
  return (
    <Animated.View
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
      style={[
        style,
        {
          opacity: reduceMotion
            ? progress
            : progress.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0, 1, 1],
              }),
          transform: reduceMotion
            ? []
            : [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [sign * distance, 0],
                  }),
                },
              ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
