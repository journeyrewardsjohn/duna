import { dunaLaunchFilmMinimumMs } from "@duna/ui/mobile";
import { StatusBar } from "expo-status-bar";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
} from "react-native";

// Metro requires static module references for media embedded in the install.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launchFilm = require("../../packages/ui/assets/duna-loading-film-v3.mp4");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launchPoster = require("./assets/duna-launch-poster-v3.png");

export function PlayerLaunchExperience({
  onComplete,
}: {
  readonly onComplete: () => void;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const completed = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const player = useVideoPlayer(launchFilm, (nextPlayer) => {
    nextPlayer.audioMixingMode = "doNotMix";
    nextPlayer.loop = false;
    nextPlayer.muted = Platform.OS === "web";
    nextPlayer.play();
  });

  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    player.pause();
    Animated.timing(opacity, {
      toValue: 0,
      duration: 180,
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
    if (reduceMotion) player.pause();
    else player.play();
  }, [player, reduceMotion]);

  useEffect(() => {
    const timeout = setTimeout(finish, dunaLaunchFilmMinimumMs);
    return () => clearTimeout(timeout);
  }, [finish]);

  return (
    <Animated.View
      accessibilityLabel="Opening Duna"
      accessibilityRole="progressbar"
      style={[styles.screen, { opacity }]}
    >
      <StatusBar style="light" />
      <Image resizeMode="cover" source={launchPoster} style={styles.media} />
      {!reduceMotion && (
        <VideoView
          contentFit="cover"
          nativeControls={false}
          player={player}
          style={styles.media}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  media: {
    bottom: 0,
    // The Figma composition uses a left-biased focal point. Extending the
    // media past the left edge shifts its visual center without uncovering an
    // edge on taller iPhone screens.
    left: "-17%",
    position: "absolute",
    right: 0,
    top: 0,
  },
  screen: {
    backgroundColor: "#071625",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1000,
  },
});
