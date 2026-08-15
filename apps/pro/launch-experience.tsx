import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { FellixText as Text } from "./fellix-text";

const launchSeenKey = "duna.pro.launch-experience.v2";
const proDurationMs = 6_042;
// Metro requires a static module reference for bundled launch media.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proLaunchVideo = require("./assets/duna-pro-launch.mp4");
const proBeats = [0.16, 1.55, 3.12, 4.72] as const;
const loadingSteps = [
  "Preparing your field workspace.",
  "Restoring your secure organization session.",
  "Syncing today’s people, sessions, and payments.",
] as const;

function ProLaunchPlayback({
  firstLaunch,
  onComplete,
}: {
  readonly firstLaunch: boolean;
  readonly onComplete: () => void;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [step, setStep] = useState(0);
  const completed = useRef(false);
  const firedBeats = useRef(new Set<number>());
  const opacity = useRef(new Animated.Value(1)).current;
  const player = useVideoPlayer(proLaunchVideo, (nextPlayer) => {
    nextPlayer.loop = false;
    nextPlayer.muted = !firstLaunch || Platform.OS === "web";
    nextPlayer.timeUpdateEventInterval = 0.05;
    nextPlayer.play();
  });
  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    player.pause();
    Animated.timing(opacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(onComplete);
  }, [onComplete, opacity, player]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!reduceMotion) return;
    player.pause();
    const timeout = setTimeout(finish, 250);
    return () => clearTimeout(timeout);
  }, [finish, player, reduceMotion]);
  useEffect(() => {
    if (reduceMotion) return;
    const timeout = setTimeout(finish, firstLaunch ? proDurationMs + 700 : 620);
    return () => clearTimeout(timeout);
  }, [finish, firstLaunch, reduceMotion]);
  useEffect(() => {
    const endSubscription = player.addListener("playToEnd", () => {
      if (firstLaunch) finish();
    });
    const timeSubscription = player.addListener(
      "timeUpdate",
      ({ currentTime }) => {
        setStep(currentTime < 1.9 ? 0 : currentTime < 3.85 ? 1 : 2);
        if (firstLaunch && Platform.OS !== "web" && !reduceMotion) {
          proBeats.forEach((beat, index) => {
            if (currentTime < beat || firedBeats.current.has(index)) return;
            firedBeats.current.add(index);
            void Haptics.impactAsync(
              index === 1 || index === 2
                ? Haptics.ImpactFeedbackStyle.Medium
                : Haptics.ImpactFeedbackStyle.Light,
            ).catch(() => undefined);
          });
        }
      },
    );
    return () => {
      endSubscription.remove();
      timeSubscription.remove();
    };
  }, [finish, firstLaunch, player, reduceMotion]);

  return (
    <Animated.View
      accessibilityLabel="Loading Duna Pro"
      accessibilityRole="progressbar"
      style={[styles.screen, { opacity }]}
    >
      {!reduceMotion && (
        <VideoView
          contentFit="contain"
          nativeControls={false}
          player={player}
          style={styles.video}
        />
      )}
      <View pointerEvents="none" style={styles.status}>
        {firstLaunch && Platform.OS !== "web" && (
          <Text style={styles.audio}>AUDIO + HAPTICS</Text>
        )}
        <Text style={styles.label}>WHAT’S HAPPENING</Text>
        <Text style={styles.detail}>{loadingSteps[step]}</Text>
      </View>
    </Animated.View>
  );
}

export function ProLaunchExperience({
  onComplete,
}: {
  readonly onComplete: () => void;
}) {
  const [firstLaunch, setFirstLaunch] = useState<boolean>();
  const complete = useCallback(() => {
    if (firstLaunch) void AsyncStorage.setItem(launchSeenKey, "complete");
    onComplete();
  }, [firstLaunch, onComplete]);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(launchSeenKey)
      .then((value) => {
        if (active) setFirstLaunch(value !== "complete");
      })
      .catch(() => {
        if (active) setFirstLaunch(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (firstLaunch === undefined) return <View style={styles.screen} />;
  return <ProLaunchPlayback firstLaunch={firstLaunch} onComplete={complete} />;
}

const styles = StyleSheet.create({
  audio: {
    color: "rgba(5,22,38,0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  detail: {
    color: "rgba(5,22,38,0.9)",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 310,
    textAlign: "center",
  },
  label: {
    color: "rgba(5,22,38,0.52)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 7,
  },
  screen: {
    alignItems: "center",
    backgroundColor: "#D1E2F0",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 100,
  },
  status: {
    alignItems: "center",
    bottom: "9%",
    left: 24,
    position: "absolute",
    right: 24,
  },
  video: { aspectRatio: 960 / 932, maxHeight: "71%", width: "100%" },
});
