import { sandColors } from "@duna/ui/sand";
import { VideoView, useVideoPlayer, type VideoSource } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { SandLoader } from "./sand-loader";
import { SatoshiText as Text } from "./satoshi-text";

/** Score and telemetry refreshes must never restart or pause the video. */
export function StableVideoSurface({
  onCompleted,
  onProgress,
  posterUrl,
  title,
  uri,
}: {
  readonly uri: string;
  readonly title: string;
  readonly posterUrl?: string;
  readonly onProgress: (seconds: number) => void;
  readonly onCompleted: (seconds: number) => void;
}) {
  const source = useMemo<VideoSource>(
    () => ({
      uri,
      contentType: uri.includes(".m3u8") ? "hls" : "auto",
      metadata: { title },
    }),
    [uri, title],
  );
  const callbacks = useRef({ onCompleted, onProgress });
  callbacks.current = { onCompleted, onProgress };
  const [firstFrame, setFirstFrame] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [playerError, setPlayerError] = useState<string>();
  const player = useVideoPlayer(source, (next) => {
    next.audioMixingMode = "doNotMix";
    next.timeUpdateEventInterval = 1;
    next.play();
  });

  useEffect(() => {
    setFirstFrame(false);
    setPlayerError(undefined);
    setBuffering(player.status !== "readyToPlay");
    const status = player.addListener("statusChange", (event) => {
      setBuffering(event.status === "loading");
      if (event.status === "error") {
        setPlayerError(
          event.error?.message ?? "This recording could not be opened.",
        );
      }
    });
    const progress = player.addListener("timeUpdate", (event) =>
      callbacks.current.onProgress(event.currentTime),
    );
    const completed = player.addListener("playToEnd", () =>
      callbacks.current.onCompleted(player.duration),
    );
    return () => {
      status.remove();
      progress.remove();
      completed.remove();
      player.pause();
    };
  }, [player]);

  const retry = async () => {
    setPlayerError(undefined);
    setFirstFrame(false);
    setBuffering(true);
    try {
      await player.replaceAsync(source);
      player.play();
    } catch (reason) {
      setPlayerError(
        reason instanceof Error
          ? reason.message
          : "This recording could not be opened.",
      );
    }
  };

  return (
    <View style={styles.surface}>
      <VideoView
        accessibilityLabel={title}
        allowsVideoFrameAnalysis={false}
        contentFit="contain"
        nativeControls
        onFirstFrameRender={() => setFirstFrame(true)}
        player={player}
        style={styles.surface}
      />
      {!firstFrame && posterUrl && !playerError && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            resizeMode="contain"
            source={{ uri: posterUrl }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}
      {(!firstFrame || buffering) && !playerError && (
        <View pointerEvents="none" style={styles.overlay}>
          <SandLoader
            label={firstFrame ? "Buffering video" : "Loading video"}
            size={80}
            tone="inverse"
          />
        </View>
      )}
      {playerError && (
        <View style={[styles.overlay, styles.failure]}>
          <Text style={styles.title}>Unable to play this video</Text>
          <Text style={styles.body}>{playerError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void retry()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { height: "100%", width: "100%" },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  failure: { backgroundColor: "#242521", padding: 20 },
  title: { color: sandColors.surface, fontSize: 18, fontWeight: "500" },
  body: {
    color: sandColors.inset,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  retry: {
    alignItems: "center",
    backgroundColor: sandColors.surface,
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 128,
    paddingHorizontal: 18,
  },
  retryText: { color: sandColors.ink, fontSize: 15, fontWeight: "500" },
});
