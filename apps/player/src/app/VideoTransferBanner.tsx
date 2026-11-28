import { useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  View,
} from "react-native";
import type { VideoTransferStatus } from "../../video-studio";
import { DunaIcon } from "../../duna-icon";
import { SatoshiText as Text } from "../../satoshi-text";
import { colors } from "../shared/palette";
import { styles } from "../legacy/styles";

export function VideoTransferBanner({
  onDismiss,
  onPress,
  status,
}: {
  readonly onDismiss: () => void;
  readonly onPress: () => void;
  readonly status: VideoTransferStatus;
}) {
  const slideX = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const progress = Math.max(0, Math.min(1, status.progress ?? 0));
  const active =
    status.stage === "importing" ||
    status.stage === "uploading" ||
    status.stage === "processing";
  const dismiss = (direction = 1) => {
    Animated.timing(slideX, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
      toValue: direction * 420,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) dismissRef.current();
    });
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_event, gesture) => slideX.setValue(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) >= 72 || Math.abs(gesture.vx) > 0.65) {
            dismiss(gesture.dx < 0 ? -1 : 1);
            return;
          }
          Animated.timing(slideX, {
            duration: 140,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.timing(slideX, {
            duration: 140,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [slideX],
  );
  const opacity = slideX.interpolate({
    inputRange: [-240, 0, 240],
    outputRange: [0.15, 1, 0.15],
    extrapolate: "clamp",
  });
  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.videoTransferBanner,
        { opacity, transform: [{ translateX: slideX }] },
      ]}
    >
      <Pressable
        accessibilityLabel={`${status.title}. ${status.detail}. Open video uploads.`}
        onPress={onPress}
        style={styles.videoTransferTap}
      >
        <View style={styles.videoTransferMark}>
          {active ? (
            <ActivityIndicator color={colors.aqua} size="small" />
          ) : (
            <Text style={styles.videoTransferMarkText}>
              {status.stage === "complete" ? "✓" : "⇅"}
            </Text>
          )}
        </View>
        <View style={styles.videoTransferCopy}>
          <View style={styles.videoTransferHeading}>
            <Text style={styles.videoTransferTitle}>{status.title}</Text>
            {status.progress !== undefined && (
              <Text style={styles.videoTransferPercent}>
                {Math.round(progress * 100)}%
              </Text>
            )}
          </View>
          <Text numberOfLines={2} style={styles.videoTransferDetail}>
            {status.detail}
          </Text>
          {status.progress !== undefined && (
            <View style={styles.videoTransferTrack}>
              <View
                style={[
                  styles.videoTransferFill,
                  { width: `${progress * 100}%` },
                ]}
              />
            </View>
          )}
        </View>
        <Text style={styles.videoTransferOpen}>View</Text>
        <Pressable
          accessibilityLabel="Dismiss video import status"
          hitSlop={4}
          onPress={(event) => {
            event.stopPropagation();
            dismiss();
          }}
          style={styles.videoTransferDismiss}
        >
          <DunaIcon color={colors.muted} name="close" size={18} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
