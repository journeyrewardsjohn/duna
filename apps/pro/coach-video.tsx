import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DunaApiClient } from "./mobile-api";
import { DunaNumericText, SatoshiText as Text } from "./satoshi-text";
import { useProRuntime } from "./runtime";
import type { TournamentControlPalette as VideoPalette } from "./tournament-control";

type VideoStudio = Awaited<
  ReturnType<DunaApiClient["player"]["videoStudio"]["query"]>
>;

type PreparedVideo = {
  readonly uri: string;
  readonly name: string;
  readonly mimeType: "video/mp4" | "video/quicktime";
  readonly bytes: number;
  readonly durationSeconds: number;
};

function duration(value: number | undefined) {
  if (!value) return "Processing";
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function CoachVideoScreen({
  onClose,
  palette,
}: {
  readonly onClose: () => void;
  readonly palette: VideoPalette;
}) {
  const { client, mode, workspace } = useProRuntime();
  const [studio, setStudio] = useState<VideoStudio>();
  const [prepared, setPrepared] = useState<PreparedVideo>();
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string>();
  const events = (workspace?.sessions ?? []).filter((session) =>
    ["tournament", "league", "clinic", "open-play", "lesson"].includes(
      session.kind,
    ),
  );
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const load = useCallback(async () => {
    if (!client || mode !== "live") return;
    setLoading(true);
    try {
      setStudio(await client.player.videoStudio.query());
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Video library could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const prepare = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.uri) return;
    const file = await fetch(asset.uri).then(async (response) => {
      if (!response.ok)
        throw new Error("Duna Pro could not prepare that video file.");
      return response.blob();
    });
    const mimeType =
      asset.mimeType === "video/quicktime" ? "video/quicktime" : "video/mp4";
    setPrepared({
      uri: asset.uri,
      name:
        asset.fileName ??
        `duna-coach-video-${Date.now()}.${mimeType === "video/quicktime" ? "mov" : "mp4"}`,
      mimeType,
      bytes: asset.fileSize ?? file.size,
      durationSeconds: Math.max(
        1,
        Math.ceil((asset.duration ?? 1_000) / 1_000),
      ),
    });
    setNotice(undefined);
  };

  const record = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setNotice("Camera permission is needed to record a coaching video.");
      return;
    }
    try {
      await prepare(
        await ImagePicker.launchCameraAsync({
          mediaTypes: ["videos"],
          videoMaxDuration: 60 * 60,
        }),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Camera could not start.",
      );
    }
  };

  const choose = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice(
        "Photo library permission is needed to choose a coaching video.",
      );
      return;
    }
    try {
      await prepare(
        await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"] }),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Video library could not open.",
      );
    }
  };

  const upload = async () => {
    if (!client || !prepared) return;
    setUploading(true);
    setProgress(0);
    setNotice(undefined);
    let videoId: string | undefined;
    try {
      const blob = await fetch(prepared.uri).then(async (response) => {
        if (!response.ok)
          throw new Error(
            "The selected video is no longer available on this device.",
          );
        return response.blob();
      });
      const session = await client.player.beginVideoUpload.mutate({
        title: selectedEvent
          ? `${selectedEvent.title} coaching video`
          : "Coach recording",
        category: selectedEvent ? "event" : "practice",
        ...(selectedEvent ? { eventId: selectedEvent.id } : {}),
        recordingVisibility: "private",
        publishedToProfile: false,
        hasAudio: true,
        visionLearningConsent: false,
        originalFileName: prepared.name,
        mimeType: prepared.mimeType,
        bytes: blob.size,
        durationSeconds: prepared.durationSeconds,
        idempotencyKey: Crypto.randomUUID(),
      });
      videoId = session.videoId;
      for (let part = 1; part <= session.totalParts; part++) {
        const offset = (part - 1) * session.partSizeBytes;
        const piece = blob.slice(
          offset,
          Math.min(blob.size, offset + session.partSizeBytes),
          prepared.mimeType,
        );
        const signed = await client.player.videoUploadPartUrl.mutate({
          videoId: session.videoId,
          partNumber: part,
        });
        const response = await fetch(signed.url, {
          method: "PUT",
          headers: { "content-type": prepared.mimeType },
          body: piece,
        });
        if (!response.ok)
          throw new Error(
            `Upload failed on part ${part}. Your original video is still on this device.`,
          );
        const etag = response.headers.get("etag");
        if (!etag)
          throw new Error("Video storage did not confirm the uploaded part.");
        await client.player.recordVideoUploadPart.mutate({
          videoId: session.videoId,
          partNumber: part,
          etag,
          sizeBytes: piece.size,
        });
        setProgress(part / session.totalParts);
      }
      await client.player.completeVideoUpload.mutate({
        videoId: session.videoId,
        idempotencyKey: Crypto.randomUUID(),
      });
      setPrepared(undefined);
      setNotice(
        "Private coaching video saved. It is not published to any player profile.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (reason) {
      if (videoId)
        void client.player.abortVideoUpload.mutate({
          videoId,
          idempotencyKey: Crypto.randomUUID(),
        });
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Video upload could not finish.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close coach video"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>COACH VIDEO</Text>
          <Text style={styles.title}>Record. Review. Teach.</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Keep coaching video private by default.
          </Text>
          <Text style={styles.heroBody}>
            Record a practice, clinic, or tournament session, then attach it to
            the event without publishing player footage publicly.
          </Text>
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {prepared ? (
          <View style={styles.ready}>
            <Text style={styles.readyTitle}>Ready to upload</Text>
            <DunaNumericText tier="block" style={styles.readyValue}>
              {duration(prepared.durationSeconds)}
            </DunaNumericText>
            <Text numberOfLines={1} style={styles.readyMeta}>
              {prepared.name} · {Math.round(prepared.bytes / 1_048_576)} MB
            </Text>
            <Pressable
              disabled={uploading}
              onPress={upload}
              style={[styles.primary, uploading && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {uploading
                  ? `Uploading ${Math.round(progress * 100)}%`
                  : "Save private video"}
              </Text>
            </Pressable>
            <Pressable
              disabled={uploading}
              onPress={() => setPrepared(undefined)}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>
                Choose a different video
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.section}>CAPTURE</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => void record()} style={styles.primary}>
                <Text style={styles.primaryText}>Record now</Text>
                <Text style={styles.primaryMeta}>Use this camera</Text>
              </Pressable>
              <Pressable onPress={() => void choose()} style={styles.secondary}>
                <Text style={styles.secondaryText}>Add from library</Text>
                <Text style={styles.secondaryMeta}>
                  Import an existing video
                </Text>
              </Pressable>
            </View>
          </>
        )}
        <Text style={styles.section}>ATTACH TO EVENT</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.eventRail}
        >
          <Pressable
            onPress={() => setSelectedEventId(undefined)}
            style={[styles.event, !selectedEvent && styles.eventActive]}
          >
            <Text
              style={[
                styles.eventText,
                !selectedEvent && styles.eventTextActive,
              ]}
            >
              Practice / no event
            </Text>
          </Pressable>
          {events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => setSelectedEventId(event.id)}
              style={[
                styles.event,
                selectedEvent?.id === event.id && styles.eventActive,
              ]}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.eventText,
                  selectedEvent?.id === event.id && styles.eventTextActive,
                ]}
              >
                {event.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.section}>VIDEO LIBRARY</Text>
        {loading ? (
          <ActivityIndicator color={palette.accent} />
        ) : studio?.videos.length ? (
          studio.videos.slice(0, 8).map((video) => (
            <View key={video.id} style={styles.video}>
              <View style={styles.flex}>
                <Text style={styles.videoTitle}>{video.title}</Text>
                <Text style={styles.videoMeta}>
                  {video.category} · {video.recordingVisibility} ·{" "}
                  {duration(video.durationSeconds)}
                </Text>
              </View>
              <Text style={styles.videoState}>{video.status}</Text>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No coaching videos yet.</Text>
            <Text style={styles.emptyBody}>
              The first one you save stays private until an authorized adult
              changes its visibility.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(palette: VideoPalette) {
  return StyleSheet.create({
    safe: { backgroundColor: palette.canvas, flex: 1 },
    flex: { flex: 1, minWidth: 0 },
    header: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 16,
    },
    close: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 36,
    },
    closeText: { color: palette.ink, fontSize: 36, lineHeight: 38 },
    eyebrow: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
    },
    title: {
      color: palette.ink,
      fontSize: 25,
      fontWeight: "800",
      letterSpacing: -0.35,
    },
    content: { gap: 14, padding: 18, paddingBottom: 42 },
    hero: {
      backgroundColor: palette.surfaceAlt,
      borderRadius: 22,
      gap: 8,
      padding: 18,
    },
    heroTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
    heroBody: { color: palette.muted, fontSize: 14, lineHeight: 20 },
    notice: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.warning,
      borderLeftWidth: 3,
      color: palette.ink,
      fontSize: 14,
      lineHeight: 20,
      padding: 12,
    },
    section: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.1,
      marginTop: 6,
    },
    actions: { flexDirection: "row", gap: 10 },
    primary: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 18,
      flex: 1,
      gap: 4,
      justifyContent: "center",
      minHeight: 86,
      padding: 14,
    },
    primaryText: { color: palette.onAccent, fontSize: 15, fontWeight: "800" },
    primaryMeta: { color: palette.onAccent, fontSize: 12, opacity: 0.8 },
    secondary: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      justifyContent: "center",
      minHeight: 86,
      padding: 14,
    },
    secondaryText: { color: palette.ink, fontSize: 14, fontWeight: "800" },
    secondaryMeta: { color: palette.muted, fontSize: 12, textAlign: "center" },
    ready: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: 10,
      padding: 18,
    },
    readyTitle: { color: palette.ink, fontSize: 17, fontWeight: "800" },
    readyValue: { color: palette.accent, fontSize: 38 },
    readyMeta: { color: palette.muted, fontSize: 13 },
    textButton: {
      alignItems: "center",
      minHeight: 48,
      justifyContent: "center",
    },
    textButtonText: { color: palette.accent, fontSize: 14, fontWeight: "700" },
    disabled: { opacity: 0.5 },
    eventRail: { marginHorizontal: -18 },
    event: {
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      marginLeft: 18,
      minHeight: 58,
      padding: 10,
      width: 142,
    },
    eventActive: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    eventText: { color: palette.ink, fontSize: 13, fontWeight: "700" },
    eventTextActive: { color: palette.onAccent },
    video: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    videoTitle: { color: palette.ink, fontSize: 15, fontWeight: "700" },
    videoMeta: {
      color: palette.muted,
      fontSize: 12,
      marginTop: 4,
      textTransform: "capitalize",
    },
    videoState: {
      color: palette.positive,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    empty: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      gap: 8,
      padding: 18,
    },
    emptyTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
    emptyBody: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  });
}
