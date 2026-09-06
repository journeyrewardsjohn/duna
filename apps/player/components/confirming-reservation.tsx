import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SatoshiText as Text } from "../satoshi-text";

export interface ConfirmingReservationPalette {
  readonly accentRgb: string;
  readonly aqua: string;
  readonly canvas: string;
  readonly ink: string;
  readonly muted: string;
  readonly onAccent: string;
  readonly overlayRgb: string;
  readonly positive: string;
  readonly positiveRgb: string;
}

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

export function ConfirmingReservation({
  createsMatch,
  palette,
  reducedMotion,
  venueName,
}: {
  readonly createsMatch: boolean;
  readonly palette: ConfirmingReservationPalette;
  readonly reducedMotion: boolean;
  readonly venueName?: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const travel = Math.max(140, Math.min(300, width - 104));

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(0.72);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          duration: 1_900,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          duration: 250,
          easing: Easing.linear,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.screen, { backgroundColor: palette.canvas }]}
    >
      <View
        style={[
          styles.mark,
          {
            backgroundColor: rgba(palette.positiveRgb, 0.1),
            borderColor: rgba(palette.positiveRgb, 0.28),
          },
        ]}
      >
        <View style={[styles.markCourt, { borderColor: palette.positive }]}>
          <View
            style={[styles.markNet, { backgroundColor: palette.positive }]}
          />
          <View
            style={[styles.markLine, { backgroundColor: palette.positive }]}
          />
        </View>
      </View>
      <Text style={[styles.eyebrow, { color: palette.positive }]}>
        PAYMENT RECEIVED
      </Text>
      <Text style={[styles.title, { color: palette.ink }]}>
        Confirming reservation.
      </Text>
      <Text style={[styles.body, { color: palette.muted }]}>
        Duna is securing your court
        {venueName ? ` at ${venueName}` : ""}
        {createsMatch
          ? ", creating the match, and sending player invitations."
          : " and preparing your confirmation."}
      </Text>

      <View style={[styles.progressTrack, { width: travel + 24 }]}>
        <View
          style={[
            styles.progressLine,
            { backgroundColor: rgba(palette.positiveRgb, 0.25) },
          ]}
        />
        <Animated.View
          style={[
            styles.progressBall,
            {
              backgroundColor: palette.positive,
              borderColor: palette.onAccent,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, travel],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      <View style={styles.steps}>
        <View style={styles.stepRow}>
          <View
            style={[
              styles.stepDot,
              styles.stepDotDone,
              { backgroundColor: palette.positive },
            ]}
          >
            <Text style={[styles.stepCheck, { color: palette.onAccent }]}>
              ✓
            </Text>
          </View>
          <Text style={[styles.stepDone, { color: palette.positive }]}>
            Payment received
          </Text>
        </View>
        <View style={styles.stepRow}>
          <View
            style={[
              styles.stepDot,
              styles.stepDotActive,
              {
                backgroundColor: rgba(palette.accentRgb, 0.12),
                borderColor: palette.aqua,
              },
            ]}
          />
          <Text style={[styles.stepActive, { color: palette.aqua }]}>
            Securing your court
          </Text>
        </View>
        {createsMatch && (
          <View style={styles.stepRow}>
            <View
              style={[
                styles.stepDot,
                { backgroundColor: rgba(palette.overlayRgb, 0.12) },
              ]}
            />
            <Text style={[styles.stepWaiting, { color: palette.muted }]}>
              Creating match + invites
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.reassurance, { color: palette.muted }]}>
        This can take a moment on a slower connection. Please keep Duna open;
        your payment will not be submitted twice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    maxWidth: 360,
    textAlign: "center",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 24,
  },
  mark: {
    alignItems: "center",
    borderRadius: 44,
    borderWidth: 1,
    height: 88,
    justifyContent: "center",
    width: 88,
  },
  markCourt: {
    borderRadius: 5,
    borderWidth: 2,
    height: 42,
    overflow: "hidden",
    position: "relative",
    transform: [{ rotate: "-8deg" }],
    width: 56,
  },
  markLine: {
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
    top: 19,
  },
  markNet: {
    bottom: 0,
    left: 26,
    position: "absolute",
    top: 0,
    width: 2,
  },
  progressBall: {
    borderRadius: 9,
    borderWidth: 3,
    height: 18,
    left: 3,
    position: "absolute",
    top: 3,
    width: 18,
  },
  progressLine: {
    borderRadius: 2,
    height: 4,
    left: 9,
    position: "absolute",
    right: 9,
    top: 10,
  },
  progressTrack: { height: 24, marginTop: 34, position: "relative" },
  reassurance: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 30,
    maxWidth: 340,
    textAlign: "center",
  },
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: 52,
    paddingHorizontal: 26,
  },
  stepActive: { fontSize: 15, fontWeight: "800" },
  stepCheck: { fontSize: 12, fontWeight: "900" },
  stepDone: { fontSize: 15, fontWeight: "700" },
  stepDot: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  stepDotActive: {
    borderWidth: 5,
  },
  stepDotDone: {
    alignItems: "center",
    justifyContent: "center",
  },
  stepRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  stepWaiting: { fontSize: 15, fontWeight: "700" },
  steps: { alignSelf: "stretch", gap: 16, marginTop: 30, maxWidth: 330 },
  title: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.5,
    lineHeight: 47,
    marginTop: 8,
    textAlign: "center",
  },
});
