/**
 * The iOS edge swipe for a pushed screen (owner feedback 28 Nov, "no way to
 * get back"): a drag that starts at the left edge carries the screen with the
 * finger; let go past a third of the width (or with a flick) and it slides
 * off and `onBack` runs, otherwise it settles back. Only a touch that starts
 * in the edge strip is taken, so the screen's own scrolling and taps are
 * untouched. Motion never gates the navigation: the slide runs under
 * `runWithWatchdog`, and `onBack` runs when it ends or when the watchdog
 * fires.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  runWithWatchdog,
  settleValues,
  tokenEasing,
  useHaptics,
  useReducedMotion,
  useTheme,
  verbTiming,
} from "@duna/ui/native";
import { EDGE_WIDTH, swipeCompletes } from "./edge-swipe";

export function EdgeSwipeBack({
  enabled,
  onBack,
  children,
  testID,
}: {
  readonly enabled: boolean;
  readonly onBack: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const reduceMotion = useReducedMotion();
  const haptics = useHaptics();
  const { colors } = useTheme();
  const backRef = useRef(onBack);
  backRef.current = onBack;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => setDragging(true),
        onPanResponderMove: (_event, gesture) => {
          offset.setValue(Math.max(0, gesture.dx));
        },
        onPanResponderRelease: (_event, gesture) => {
          const width = widthRef.current;
          const completes = swipeCompletes(gesture.dx, gesture.vx, width);
          const timing = verbTiming("cross", reduceMotion);
          const end = completes ? width : 0;
          const animation = Animated.timing(offset, {
            toValue: end,
            duration: timing.duration,
            easing: tokenEasing("cross"),
            useNativeDriver: true,
          });
          runWithWatchdog(animation, {
            timeline: timing.duration,
            settle: settleValues([[offset, end]]),
            onFinish: () => {
              setDragging(false);
              if (completes) {
                haptics.selection();
                backRef.current();
                // The next pushed screen starts in place.
                offset.setValue(0);
              }
            },
          });
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          offset.setValue(0);
        },
      }),
    [haptics, offset, reduceMotion],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
  };

  if (!enabled) return <View style={styles.fill}>{children}</View>;

  return (
    <View onLayout={onLayout} style={styles.fill} testID={testID}>
      <Animated.View
        style={[
          styles.fill,
          dragging
            ? {
                shadowColor: colors.text,
                shadowOpacity: 0.18,
                shadowRadius: 16,
                shadowOffset: { width: -4, height: 0 },
              }
            : null,
          { transform: [{ translateX: offset }] },
        ]}
      >
        {children}
      </Animated.View>
      <View
        accessible={false}
        style={styles.edge}
        testID="edge-swipe-back"
        {...responder.panHandlers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  edge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
  },
});
