import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  cancelFileBackedUpload,
  enqueueFileBackedParts,
  getCompletedFileBackedParts,
  isBackgroundUploadAvailable,
} from "@duna/expo-background-upload";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
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

type ProVideoUploadDraft = {
  readonly id: string;
  readonly prepared: PreparedVideo;
  readonly title: string;
  readonly category: "practice" | "event";
  readonly eventId?: string;
  readonly beginIdempotencyKey: string;
  readonly completeIdempotencyKey: string;
  readonly cancelIdempotencyKey: string;
  readonly upload?: {
    readonly videoId: string;
    readonly uploadId: string;
  };
};

const proVideoDraftKey = "duna.pro.coach-video.upload.v1";
const proVideoDirectory = new Directory(Paths.document, "duna-pro-coach-video");

function isProVideoUploadDraft(value: unknown): value is ProVideoUploadDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProVideoUploadDraft>;
  return Boolean(
    typeof candidate.id === "string" &&
    candidate.prepared &&
    typeof candidate.prepared.uri === "string" &&
    typeof candidate.prepared.bytes === "number" &&
    typeof candidate.prepared.durationSeconds === "number" &&
    typeof candidate.title === "string" &&
    (candidate.category === "practice" || candidate.category === "event") &&
    typeof candidate.beginIdempotencyKey === "string" &&
    typeof candidate.completeIdempotencyKey === "string" &&
    typeof candidate.cancelIdempotencyKey === "string",
  );
}

async function loadProVideoUploadDraft(): Promise<
  ProVideoUploadDraft | undefined
> {
  try {
    const stored = await AsyncStorage.getItem(proVideoDraftKey);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as unknown;
    return isProVideoUploadDraft(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function saveProVideoUploadDraft(
  draft: ProVideoUploadDraft,
): Promise<void> {
  await AsyncStorage.setItem(proVideoDraftKey, JSON.stringify(draft));
}

async function removeProVideoUploadDraft(
  draft: ProVideoUploadDraft,
): Promise<void> {
  await AsyncStorage.removeItem(proVideoDraftKey);
  const file = new File(draft.prepared.uri);
  if (file.exists) file.delete();
}

async function retainProVideo(input: {
  readonly id: string;
  readonly sourceUri: string;
  readonly name: string;
}): Promise<string> {
  proVideoDirectory.create({ idempotent: true, intermediates: true });
  const extension = input.name.split(".").at(-1) || "mp4";
  const destination = new File(proVideoDirectory, `${input.id}.${extension}`);
  const source = new File(input.sourceUri);
  if (!source.exists) {
    throw new Error("Duna Pro could not retain the selected coaching video.");
  }
  if (destination.exists) destination.delete();
  await source.copy(destination);
  return destination.uri;
}

/** Android/web keep a foreground, file-backed range upload. The iOS native
 * module owns durable background scheduling; this fallback makes no claim
 * that Android will continue after the app is suspended. */
async function uploadForegroundFileRange(input: {
  readonly fileUri: string;
  readonly uploadUrl: string;
  readonly offset: number;
  readonly length: number;
  readonly contentType: string;
}): Promise<string> {
  const source = new File(input.fileUri);
  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: source.slice(
      input.offset,
      input.offset + input.length,
      input.contentType,
    ),
  });
  if (!response.ok) throw new Error("Private storage rejected an upload part.");
  const etag = response.headers.get("etag");
  if (!etag) throw new Error("Private storage did not confirm an upload part.");
  return etag;
}

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
  const [durableUpload, setDurableUpload] = useState<ProVideoUploadDraft>();
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string>();
  const uploadFlight = useRef(false);
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

  useEffect(() => {
    let active = true;
    void loadProVideoUploadDraft().then((draft) => {
      if (!active || !draft) return;
      const source = new File(draft.prepared.uri);
      if (!source.exists) {
        void AsyncStorage.removeItem(proVideoDraftKey);
        setNotice(
          "The saved coaching-video source is no longer available. Please choose it again.",
        );
        return;
      }
      setDurableUpload(draft);
      setPrepared(draft.prepared);
      setSelectedEventId(draft.eventId);
      setNotice(
        "Your coaching video is safely retained on this device. Resume its upload when you are ready.",
      );
    });
    return () => {
      active = false;
    };
  }, []);

  const prepare = async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.uri) return;
    if (!asset.fileSize || asset.fileSize <= 0) {
      throw new Error(
        "Duna Pro could not read the selected video size. Please choose the original file again.",
      );
    }
    const mimeType =
      asset.mimeType === "video/quicktime" ? "video/quicktime" : "video/mp4";
    if (durableUpload) {
      throw new Error(
        "Finish or explicitly cancel the saved coaching-video upload before choosing another video.",
      );
    }
    const id = Crypto.randomUUID();
    const name =
      asset.fileName ??
      `duna-coach-video-${Date.now()}.${mimeType === "video/quicktime" ? "mov" : "mp4"}`;
    const retained: PreparedVideo = {
      uri: await retainProVideo({ id, sourceUri: asset.uri, name }),
      name,
      mimeType,
      bytes: asset.fileSize,
      durationSeconds: Math.max(
        1,
        Math.ceil((asset.duration ?? 1_000) / 1_000),
      ),
    };
    const draft: ProVideoUploadDraft = {
      id,
      prepared: retained,
      title: selectedEvent
        ? `${selectedEvent.title} coaching video`
        : "Coach recording",
      category: selectedEvent ? "event" : "practice",
      eventId: selectedEvent?.id,
      beginIdempotencyKey: Crypto.randomUUID(),
      completeIdempotencyKey: Crypto.randomUUID(),
      cancelIdempotencyKey: Crypto.randomUUID(),
    };
    await saveProVideoUploadDraft(draft);
    setDurableUpload(draft);
    setPrepared(retained);
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
    if (!client || !durableUpload || uploadFlight.current) return;
    uploadFlight.current = true;
    setUploading(true);
    setProgress(0);
    setNotice(undefined);
    try {
      let draft = durableUpload;
      const session = draft.upload
        ? await client.player.resumeVideoUpload.query({
            videoId: draft.upload.videoId,
          })
        : await client.player.beginVideoUpload.mutate({
            title: draft.title,
            category: draft.category,
            ...(draft.eventId ? { eventId: draft.eventId } : {}),
            recordingVisibility: "private",
            publishedToProfile: false,
            hasAudio: true,
            visionLearningConsent: false,
            originalFileName: draft.prepared.name,
            mimeType: draft.prepared.mimeType,
            bytes: draft.prepared.bytes,
            durationSeconds: draft.prepared.durationSeconds,
            idempotencyKey: draft.beginIdempotencyKey,
          });
      if (!draft.upload) {
        draft = {
          ...draft,
          upload: { videoId: session.videoId, uploadId: session.uploadId },
        };
        await saveProVideoUploadDraft(draft);
        setDurableUpload(draft);
      }
      // iOS persists staged ranges and completed ETags. Reconcile anything
      // completed while JavaScript was suspended before scheduling new parts.
      const completed = await getCompletedFileBackedParts(session.uploadId);
      for (const part of completed) {
        await client.player.recordVideoUploadPart.mutate({
          videoId: session.videoId,
          partNumber: part.partNumber,
          etag: part.etag,
          sizeBytes: part.sizeBytes,
        });
      }
      const resumed = await client.player.resumeVideoUpload.query({
        videoId: session.videoId,
      });
      const uploadedPartNumbers = new Set(resumed.uploadedParts);
      const missingPartNumbers = Array.from(
        { length: session.totalParts },
        (_, index) => index + 1,
      ).filter((partNumber) => !uploadedPartNumbers.has(partNumber));
      setProgress(uploadedPartNumbers.size / session.totalParts);
      if (
        missingPartNumbers.length > 0 &&
        Platform.OS === "ios" &&
        isBackgroundUploadAvailable()
      ) {
        const parts: Array<{
          partNumber: number;
          uploadUrl: string;
          offset: number;
          length: number;
          contentType: string;
        }> = [];
        // Sign serially so one large coaching video cannot burst every part
        // request at the API before native iOS transfer ownership begins.
        for (const partNumber of missingPartNumbers) {
          const offset = (partNumber - 1) * session.partSizeBytes;
          const signed = await client.player.videoUploadPartUrl.mutate({
            videoId: session.videoId,
            partNumber,
          });
          parts.push({
            partNumber,
            uploadUrl: signed.url,
            offset,
            length: Math.min(
              session.partSizeBytes,
              draft.prepared.bytes - offset,
            ),
            contentType: draft.prepared.mimeType,
          });
        }
        await enqueueFileBackedParts({
          uploadId: session.uploadId,
          fileUri: draft.prepared.uri,
          allowCellular: false,
          parts,
        });
        setNotice(
          "Every remaining part is queued with iOS. Reopen Duna Pro to reconcile completion.",
        );
        return;
      }
      // Android and web intentionally use a foreground, file-backed fallback.
      // It remains retryable but does not claim iOS-style background durability.
      for (const partNumber of missingPartNumbers) {
        const offset = (partNumber - 1) * session.partSizeBytes;
        const signed = await client.player.videoUploadPartUrl.mutate({
          videoId: session.videoId,
          partNumber,
        });
        const length = Math.min(
          session.partSizeBytes,
          draft.prepared.bytes - offset,
        );
        const etag = await uploadForegroundFileRange({
          fileUri: draft.prepared.uri,
          uploadUrl: signed.url,
          offset,
          length,
          contentType: draft.prepared.mimeType,
        });
        await client.player.recordVideoUploadPart.mutate({
          videoId: session.videoId,
          partNumber,
          etag,
          sizeBytes: length,
        });
        setProgress(partNumber / session.totalParts);
      }
      await client.player.completeVideoUpload.mutate({
        videoId: session.videoId,
        idempotencyKey: draft.completeIdempotencyKey,
      });
      await cancelFileBackedUpload(session.uploadId).catch(() => undefined);
      await removeProVideoUploadDraft(draft);
      setDurableUpload(undefined);
      setPrepared(undefined);
      setNotice(
        "Private coaching video saved. It is not published to any player profile.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Video upload paused safely. It will reconcile when you retry.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      uploadFlight.current = false;
      setUploading(false);
    }
  };

  const cancelUpload = async () => {
    if (!durableUpload || uploading || uploadFlight.current) return;
    uploadFlight.current = true;
    setUploading(true);
    try {
      if (durableUpload.upload) {
        if (!client) {
          throw new Error(
            "Reconnect Duna Pro before cancelling an active cloud upload.",
          );
        }
        await client.player.abortVideoUpload.mutate({
          videoId: durableUpload.upload.videoId,
          idempotencyKey: durableUpload.cancelIdempotencyKey,
        });
        await cancelFileBackedUpload(durableUpload.upload.uploadId).catch(
          () => undefined,
        );
      }
      await removeProVideoUploadDraft(durableUpload);
      setDurableUpload(undefined);
      setPrepared(undefined);
      setNotice(
        "Coaching-video upload cancelled and its retained local copy removed.",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Duna Pro could not cancel this upload.",
      );
    } finally {
      uploadFlight.current = false;
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!durableUpload?.upload || !client) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void upload();
    });
    return () => subscription.remove();
  }, [client, durableUpload?.upload?.videoId]);

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
            {Platform.OS !== "ios" && (
              <Text style={styles.readyMeta}>
                Foreground upload only on this device. Keep Duna Pro open until
                it finishes; leaving the app pauses safely for retry.
              </Text>
            )}
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
              onPress={() => void cancelUpload()}
              style={styles.textButton}
            >
              <Text style={styles.textButtonText}>Cancel saved upload</Text>
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
