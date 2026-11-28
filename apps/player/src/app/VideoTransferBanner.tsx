import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import {
  Icon,
  Spinner,
  runWithWatchdog,
  settleValues,
  Text,
  useReducedMotion,
  useTheme,
} from "@duna/ui/native";
import { useMemo, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { VideoTransferStatus } from "../../video-studio";

/**
 * Upload and import progress for a recording, shown by the shell over every
 * tab (top edge, below the status bar or the Duo's camera column) so it
 * never sits on the system tab bar. Tap opens Film; swipe sideways or the
 * close button dismisses it.
 */
export function VideoTransferBanner({
  onDismiss,
  onPress,
  status,
}: {
  readonly onDismiss: () => void;
  readonly onPress: () => void;
  readonly status: VideoTransferStatus;
}) {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const slideX = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const progress = Math.max(0, Math.min(1, status.progress ?? 0));
  const active =
    status.stage === "importing" ||
    status.stage === "uploading" ||
    status.stage === "processing";
  const responder = useMemo(() => {
    // The swipe-away dismisses in `done`; the watchdog makes sure it runs
    // even if the native driver never reports back.
    const settle = (toValue: number, done?: () => void) =>
      runWithWatchdog(
        Animated.timing(slideX, {
          duration: reduceMotion ? 0 : 160,
          toValue,
          useNativeDriver: true,
        }),
        {
          timeline: reduceMotion ? 0 : 160,
          settle: settleValues([[slideX, toValue]]),
          onFinish: done,
        },
      );
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => slideX.setValue(gesture.dx),
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) >= 72 || Math.abs(gesture.vx) > 0.65) {
          settle(gesture.dx < 0 ? -420 : 420, () => dismissRef.current());
          return;
        }
        settle(0);
      },
      onPanResponderTerminate: () => settle(0),
    });
  }, [reduceMotion, slideX]);
  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.root,
        {
          top: insets.top + tokens.space["2"],
          left: insets.left + tokens.space["3"],
          right: insets.right + tokens.space["3"],
          transform: [{ translateX: slideX }],
        },
      ]}
    >
      <Pressable
        accessibilityHint="Opens Film"
        accessibilityLabel={`${status.title}. ${status.detail}.${status.progress !== undefined ? ` ${Math.round(progress * 100)} percent.` : ""}`}
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: tokens.radius.xl,
          },
        ]}
      >
        <View style={styles.mark}>
          {active ? (
            <Spinner label={status.title} />
          ) : (
            <Icon
              name={status.stage === "complete" ? "success" : "film"}
              tone={status.stage === "complete" ? "positive" : "text-2"}
            />
          )}
        </View>
        <View style={styles.copy}>
          <View style={styles.heading}>
            <Text
              numberOfLines={1}
              style={styles.flex}
              variant="phone-body"
              weight={600}
            >
              {status.title}
            </Text>
            {status.progress !== undefined ? (
              <Text tabular tone="text-2" variant="phone-meta" weight={600}>
                {`${Math.round(progress * 100)}%`}
              </Text>
            ) : null}
          </View>
          <Text numberOfLines={2} tone="text-2" variant="phone-meta">
            {status.detail}
          </Text>
          {status.progress !== undefined ? (
            <View
              style={[
                styles.track,
                { backgroundColor: colors["surface-sunken"] },
              ]}
            >
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.action,
                    width: `${progress * 100}%`,
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Dismiss video upload status"
          accessibilityRole="button"
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            dismissRef.current();
          }}
          style={styles.close}
        >
          <Icon name="close" size="inline" tone="text-2" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", zIndex: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: "0 8px 24px rgba(14, 26, 34, 0.12)",
  },
  mark: { width: 28, alignItems: "center" },
  copy: { flex: 1, gap: 4 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4 },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
