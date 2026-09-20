import { Mic, AudioLines } from "lucide-react-native";
import { AudioSession } from "@livekit/react-native";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { Room, RoomEvent, type TranscriptionSegment } from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import type { DunaApiClient } from "./mobile-api";
import { useProRuntime } from "./runtime";
import {
  useProDesign,
  useProStyles,
  type ProDesignTokens,
} from "./design-theme";
import { SandLoader } from "./sand-loader";

type SessionDetail = Awaited<
  ReturnType<DunaApiClient["operator"]["sessionDetail"]["query"]>
>;
type RecorderPhase = "ready" | "connecting" | "listening" | "review";
type Visibility = "private" | "player";

function summarize(value: string): string {
  const transcript = value.replace(/\s+/g, " ").trim();
  if (!transcript) return "";
  const selected = transcript
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  return selected.length <= 650
    ? selected
    : `${selected.slice(0, 647).trimEnd()}…`;
}

function detectedPeople(
  transcript: string,
  attendees: SessionDetail["attendees"],
): ReadonlySet<string> {
  const text = transcript.toLocaleLowerCase();
  const firstNameCounts = new Map<string, number>();
  for (const person of attendees) {
    const first = person.displayName.trim().split(/\s+/)[0]?.toLowerCase();
    if (first)
      firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }
  return new Set(
    attendees
      .filter((person) => {
        const name = person.displayName.trim().toLowerCase();
        const first = name.split(/\s+/)[0];
        if (name.length > 1 && text.includes(name)) return true;
        return Boolean(
          first &&
          first.length > 2 &&
          firstNameCounts.get(first) === 1 &&
          new RegExp(
            `\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i",
          ).test(text),
        );
      })
      .map((person) => person.personId),
  );
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function VoiceOrb({ active }: { readonly active: boolean }) {
  const { tokens, reducedMotion } = useProDesign();
  const styles = useProStyles(createStyles);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 950,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 950,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, pulse, reducedMotion]);
  return (
    <View style={styles.orbWrap}>
      <Animated.View
        style={[
          styles.orbPulse,
          {
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.3],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.85, 1.3],
                }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.orb, active && styles.orbActive]}>
        {active ? (
          <AudioLines size={28} color={tokens.loss} />
        ) : (
          <Mic size={28} color={tokens.text1} strokeWidth={1.6} />
        )}
      </View>
    </View>
  );
}

export function SessionNotesScreen({
  sessionId,
  initialPersonId,
  onClose,
  onSaved,
}: {
  readonly sessionId: string;
  readonly initialPersonId?: string;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void>;
}) {
  const { tokens } = useProDesign();
  const styles = useProStyles(createStyles);
  const { client, createSessionNoteRoom, mode } = useProRuntime();
  const [detail, setDetail] = useState<SessionDetail>();
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<RecorderPhase>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [subject, setSubject] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(initialPersonId ? [initialPersonId] : []),
  );
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [voiceError, setVoiceError] = useState<string>();
  const [savedNoteId, setSavedNoteId] = useState<string>();
  const [published, setPublished] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const roomRef = useRef<Room | undefined>(undefined);
  const transcriptSegmentsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (mode !== "live" || !client) {
      setLoading(false);
      return;
    }
    let active = true;
    void client.operator.sessionDetail
      .query({ sessionId })
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "This session could not be opened.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, mode, sessionId]);

  useEffect(() => {
    if (phase !== "listening") return;
    const interval = setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(
    () => () => {
      const room = roomRef.current;
      roomRef.current = undefined;
      if (room) void room.disconnect();
      void AudioSession.stopAudioSession().catch(() => undefined);
    },
    [],
  );

  const detectedIds = useMemo(
    () => detectedPeople(transcript, detail?.attendees ?? []),
    [detail?.attendees, transcript],
  );
  const recipientIds = useMemo(
    () => new Set([...selectedIds, ...detectedIds]),
    [detectedIds, selectedIds],
  );

  const updateTranscript = () => {
    const next = [...transcriptSegmentsRef.current.values()]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (next) setTranscript(next);
  };

  const beginVoice = async () => {
    if (!createSessionNoteRoom || !detail) {
      setVoiceError(
        "LiveKit voice capture is unavailable. Type the note below instead.",
      );
      setPhase("review");
      return;
    }
    setPhase("connecting");
    setVoiceError(undefined);
    setError(undefined);
    setElapsed(0);
    setTranscript("");
    setSummary("");
    transcriptSegmentsRef.current.clear();
    try {
      const credentials = await createSessionNoteRoom(sessionId);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.registerTextStreamHandler(
        "lk.transcription",
        (reader, participant) => {
          void reader.readAll().then((text) => {
            if (participant.identity !== room.localParticipant.identity) return;
            const attributes = reader.info.attributes ?? {};
            if (attributes["lk.transcription_final"] !== "true") return;
            const segmentId = attributes["lk.segment_id"] ?? reader.info.id;
            transcriptSegmentsRef.current.set(segmentId, text.trim());
            updateTranscript();
          });
        },
      );
      room.on(
        RoomEvent.TranscriptionReceived,
        (segments: TranscriptionSegment[], participant) => {
          if (participant?.identity !== room.localParticipant.identity) return;
          for (const segment of segments) {
            if (segment.final) {
              transcriptSegmentsRef.current.set(
                segment.id,
                segment.text.trim(),
              );
            }
          }
          updateTranscript();
        },
      );
      room.on(RoomEvent.Disconnected, () => {
        setPhase((value) => (value === "listening" ? "review" : value));
      });
      await AudioSession.startAudioSession();
      await room.connect(credentials.serverUrl, credentials.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      setRecorded(true);
      setPhase("listening");
      if (Platform.OS !== "web") void Haptics.selectionAsync();
    } catch (reason) {
      const room = roomRef.current;
      roomRef.current = undefined;
      if (room) await room.disconnect().catch(() => undefined);
      await AudioSession.stopAudioSession().catch(() => undefined);
      setPhase("review");
      setVoiceError(
        reason instanceof Error
          ? `${reason.message} You can type the same note below.`
          : "Voice capture could not start. Type the note below instead.",
      );
    }
  };

  const finishVoice = async () => {
    const room = roomRef.current;
    roomRef.current = undefined;
    if (room) {
      await room.localParticipant
        .setMicrophoneEnabled(false)
        .catch(() => undefined);
      await room.disconnect().catch(() => undefined);
    }
    await AudioSession.stopAudioSession().catch(() => undefined);
    setSummary((value) => value || summarize(transcript));
    setPhase("review");
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const save = async () => {
    if (mode !== "live" || !client) {
      setError("Preview mode does not save session notes.");
      return;
    }
    const cleanTranscript = transcript.trim();
    const cleanSummary = (summary.trim() || summarize(cleanTranscript)).trim();
    if (!cleanTranscript && !cleanSummary) {
      setError("Record or type a note before saving.");
      return;
    }
    if (visibility === "player" && recipientIds.size === 0) {
      setError("Choose at least one player for a shareable note.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.operator.createSessionNote.mutate({
        sessionId,
        subject: subject.trim() || undefined,
        visibility,
        source: recorded ? "livekit-voice" : "typed",
        transcript: cleanTranscript || undefined,
        summary: cleanSummary || undefined,
        recipientPersonIds: [...recipientIds],
        idempotencyKey: Crypto.randomUUID(),
      });
      setSavedNoteId(result.id);
      setSummary(cleanSummary);
      await onSaved();
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The note could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!client || !savedNoteId) return;
    setBusy(true);
    setError(undefined);
    try {
      await client.operator.publishSessionNote.mutate({
        noteId: savedNoteId,
        confirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      });
      setPublished(true);
      setConfirmPublish(false);
      await onSaved();
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The player note could not be shared.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.centerState}>
          <SandLoader label="Opening the session" />
        </View>
      </SafeAreaView>
    );
  }

  if (savedNoteId) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.savedPage}>
          <View style={[styles.savedIcon, published && styles.savedIconShared]}>
            <Text style={styles.savedIconText}>{published ? "✓" : "▣"}</Text>
          </View>
          <Text style={styles.savedEyebrow}>
            {published
              ? "SHARED WITH PLAYERS"
              : visibility === "private"
                ? "PRIVATE NOTE SAVED"
                : "SHAREABLE DRAFT SAVED"}
          </Text>
          <Text style={styles.savedTitle}>
            {published
              ? "Feedback delivered."
              : visibility === "private"
                ? "This stays with the club."
                : "Nothing has been sent yet."}
          </Text>
          <Text style={styles.savedBody}>{summary || transcript}</Text>
          {visibility === "player" && !published && !confirmPublish && (
            <View style={styles.savedActions}>
              <Pressable
                onPress={() => setConfirmPublish(true)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Review and share</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Keep as draft</Text>
              </Pressable>
            </View>
          )}
          {visibility === "player" && !published && confirmPublish && (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmEyebrow}>FINAL CONFIRMATION</Text>
              <Text style={styles.confirmTitle}>
                Share with {recipientIds.size} player
                {recipientIds.size === 1 ? "" : "s"}?
              </Text>
              <Text style={styles.confirmBody}>
                This publishes the reviewed summary to the selected player
                profiles. Your full transcript remains private to authorized
                staff.
              </Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable
                disabled={busy}
                onPress={() => void publish()}
                style={[styles.primaryButton, busy && styles.disabled]}
              >
                {busy ? (
                  <ActivityIndicator color={tokens.buttonPrimaryForeground} />
                ) : (
                  <Text style={styles.primaryButtonText}>Share now</Text>
                )}
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => setConfirmPublish(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Not yet</Text>
              </Pressable>
            </View>
          )}
          {(visibility === "private" || published) && (
            <Pressable onPress={onClose} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.topbar}>
        <Pressable
          disabled={busy || phase === "listening"}
          onPress={onClose}
          style={styles.topButton}
        >
          <Text style={styles.topButtonText}>Close</Text>
        </Pressable>
        <Text style={styles.topTitle}>Session notes</Text>
        <View style={styles.topButton} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>CAPTURE IT WHILE IT’S FRESH</Text>
        <Text style={styles.title}>
          {detail?.session.title ?? "Session note"}
        </Text>
        <Text style={styles.subtitle}>
          Speak naturally. Duna drafts the transcript, summarizes it, and flags
          unambiguous roster names for your review.
        </Text>

        <View
          style={[
            styles.voiceCard,
            phase === "listening" && styles.voiceCardLive,
          ]}
        >
          <VoiceOrb active={phase === "listening"} />
          <Text style={styles.voiceState}>
            {phase === "connecting"
              ? "CONNECTING MICROPHONE"
              : phase === "listening"
                ? `LISTENING · ${clock(elapsed)}`
                : recorded
                  ? "VOICE DRAFT READY"
                  : "VOICE NOTE"}
          </Text>
          <Text style={styles.voicePrompt}>
            {phase === "listening"
              ? "Talk through the whole session or individual players."
              : "Your note is never shared while you are recording."}
          </Text>
          {phase === "listening" ? (
            <Pressable
              onPress={() => void finishVoice()}
              style={styles.stopButton}
            >
              <Text style={styles.stopButtonIcon}>■</Text>
              <Text style={styles.stopButtonText}>Finish recording</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={phase === "connecting" || !detail}
              onPress={() => void beginVoice()}
              style={[
                styles.recordButton,
                (!detail || phase === "connecting") && styles.disabled,
              ]}
            >
              {phase === "connecting" ? (
                <ActivityIndicator color={tokens.buttonPrimaryForeground} />
              ) : (
                <>
                  <Text style={styles.recordButtonIcon}>●</Text>
                  <Text style={styles.recordButtonText}>
                    {recorded ? "Record again" : "Start recording"}
                  </Text>
                </>
              )}
            </Pressable>
          )}
          {voiceError && <Text style={styles.voiceError}>{voiceError}</Text>}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>EDITABLE TRANSCRIPT</Text>
          <TextInput
            accessibilityLabel="Editable transcript"
            multiline
            onChangeText={setTranscript}
            placeholder="You can also type a note here…"
            placeholderTextColor={tokens.text2}
            style={[styles.input, styles.transcriptInput]}
            value={transcript}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>SHORT SUMMARY</Text>
          <TextInput
            accessibilityLabel="Short summary"
            multiline
            onChangeText={setSummary}
            onFocus={() =>
              setSummary((value) => value || summarize(transcript))
            }
            placeholder="Duna will draft this from the transcript."
            placeholderTextColor={tokens.text2}
            style={[styles.input, styles.summaryInput]}
            value={summary}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>TITLE · OPTIONAL</Text>
          <TextInput
            accessibilityLabel="Title, optional"
            onChangeText={setSubject}
            placeholder="Serve-receive follow-up"
            placeholderTextColor={tokens.text2}
            style={styles.input}
            value={subject}
          />
        </View>

        <Text style={styles.sectionLabel}>WHO CAN SEE IT?</Text>
        <Pressable
          onPress={() => setVisibility("private")}
          style={[
            styles.visibilityCard,
            visibility === "private" && styles.visibilityCardOn,
          ]}
        >
          <View style={styles.visibilityIcon}>
            <Text style={styles.visibilityIconText}>▣</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.visibilityTitle}>Private coach note</Text>
            <Text style={styles.visibilityBody}>
              Authorized club staff only. Never sent to players.
            </Text>
          </View>
          <View
            style={[styles.radio, visibility === "private" && styles.radioOn]}
          >
            {visibility === "private" && <View style={styles.radioDot} />}
          </View>
        </Pressable>
        <Pressable
          onPress={() => setVisibility("player")}
          style={[
            styles.visibilityCard,
            visibility === "player" && styles.visibilityCardOn,
          ]}
        >
          <View style={styles.visibilityIcon}>
            <Text style={styles.visibilityIconText}>↗</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.visibilityTitle}>Player-shareable draft</Text>
            <Text style={styles.visibilityBody}>
              Saves privately first. Sharing takes a second confirmation.
            </Text>
          </View>
          <View
            style={[styles.radio, visibility === "player" && styles.radioOn]}
          >
            {visibility === "player" && <View style={styles.radioDot} />}
          </View>
        </Pressable>

        {(detail?.attendees.length ?? 0) > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              {visibility === "private"
                ? "ATTACH TO PROFILES · OPTIONAL"
                : "PLAYERS WHO MAY RECEIVE IT"}
            </Text>
            <View style={styles.peopleList}>
              {detail?.attendees.map((attendee) => {
                const detected = detectedIds.has(attendee.personId);
                const selected = recipientIds.has(attendee.personId);
                return (
                  <Pressable
                    key={attendee.personId}
                    onPress={() => {
                      if (detected) return;
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(attendee.personId))
                          next.delete(attendee.personId);
                        else next.add(attendee.personId);
                        return next;
                      });
                    }}
                    style={[styles.personRow, selected && styles.personRowOn]}
                  >
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>
                        {attendee.displayName
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.personName}>
                        {attendee.displayName}
                      </Text>
                      <Text style={styles.personMeta}>
                        {detected
                          ? "Detected in transcript · edit transcript to remove"
                          : attendee.attendanceStatus}
                      </Text>
                    </View>
                    <View style={[styles.check, selected && styles.checkOn]}>
                      {selected && <Text style={styles.checkText}>✓</Text>}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyNoteIcon}>◈</Text>
          <Text style={styles.privacyNoteText}>
            Saving never sends a note. Player sharing always requires a
            separate, explicit confirmation.
          </Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          disabled={busy || phase === "listening" || phase === "connecting"}
          onPress={() => void save()}
          style={[
            styles.primaryButton,
            (busy || phase === "listening" || phase === "connecting") &&
              styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={tokens.buttonPrimaryForeground} />
          ) : (
            <Text style={styles.primaryButtonText}>Save note draft</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function createStyles(tokens: ProDesignTokens) {
  return StyleSheet.create({
    safe: { backgroundColor: tokens.ground, flex: 1 },
    flex: { flex: 1 },
    topbar: {
      alignItems: "center",
      borderBottomColor: tokens.hairline,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 58,
      paddingHorizontal: 16,
    },
    topButton: { justifyContent: "center", minHeight: 48, minWidth: 72 },
    topButtonText: { color: tokens.text1, fontSize: 15, fontWeight: "500" },
    topTitle: { color: tokens.text1, fontSize: 17, fontWeight: "700" },
    centerState: {
      alignItems: "center",
      flex: 1,
      gap: 14,
      justifyContent: "center",
    },
    centerTitle: { color: tokens.text1, fontSize: 18, fontWeight: "700" },
    content: { padding: 20, paddingBottom: 135 },
    eyebrow: {
      color: tokens.text1,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.15,
      marginTop: 12,
    },
    title: {
      color: tokens.text1,
      fontSize: 34,
      fontWeight: "400",
      letterSpacing: -0.7,
      lineHeight: 39,
      marginTop: 8,
    },
    subtitle: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 9,
    },
    voiceCard: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderRadius: 26,
      marginTop: 24,
      overflow: "hidden",
      padding: 24,
    },
    voiceCardLive: { backgroundColor: tokens.surface1 },
    orbWrap: {
      alignItems: "center",
      height: 104,
      justifyContent: "center",
      width: 104,
    },
    orbPulse: {
      backgroundColor: tokens.loss,
      borderRadius: 52,
      height: 104,
      position: "absolute",
      width: 104,
    },
    orb: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 36,
      height: 72,
      justifyContent: "center",
      width: 72,
    },
    orbActive: { backgroundColor: tokens.surface2 },
    voiceState: {
      color: tokens.text1,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginTop: 15,
    },
    voicePrompt: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      textAlign: "center",
    },
    recordButton: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: 16,
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      marginTop: 20,
      minHeight: 56,
      paddingHorizontal: 24,
      width: "100%",
    },
    recordButtonIcon: { color: tokens.buttonPrimaryForeground, fontSize: 16 },
    recordButtonText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "700",
    },
    stopButton: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 16,
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      marginTop: 20,
      minHeight: 56,
      paddingHorizontal: 24,
      width: "100%",
    },
    stopButtonIcon: { color: tokens.loss, fontSize: 14 },
    stopButtonText: { color: tokens.text1, fontSize: 14, fontWeight: "700" },
    voiceError: {
      color: tokens.loss,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 14,
      textAlign: "center",
    },
    fieldGroup: { gap: 7, marginTop: 22 },
    label: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "500",
      letterSpacing: 0,
    },
    input: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 16,
      borderWidth: 1,
      color: tokens.text1,
      fontSize: 16,
      minHeight: 54,
      paddingHorizontal: 15,
      paddingVertical: 14,
    },
    transcriptInput: { minHeight: 150, textAlignVertical: "top" },
    summaryInput: { minHeight: 105, textAlignVertical: "top" },
    sectionLabel: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "500",
      letterSpacing: 0,
      marginTop: 28,
      marginBottom: 8,
    },
    visibilityCard: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 19,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      marginTop: 9,
      minHeight: 88,
      padding: 14,
    },
    visibilityCardOn: {
      backgroundColor: tokens.surface2,
      borderColor: tokens.text1,
    },
    visibilityIcon: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 13,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    visibilityIconText: {
      color: tokens.text1,
      fontSize: 19,
      fontWeight: "700",
    },
    visibilityTitle: { color: tokens.text1, fontSize: 15, fontWeight: "700" },
    visibilityBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 3,
    },
    radio: {
      alignItems: "center",
      borderColor: tokens.hairline,
      borderRadius: 11,
      borderWidth: 2,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    radioOn: { borderColor: tokens.text1 },
    radioDot: {
      backgroundColor: tokens.text1,
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    peopleList: { gap: 8 },
    personRow: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 17,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 72,
      padding: 12,
    },
    personRowOn: {
      backgroundColor: tokens.surface2,
      borderColor: tokens.text1,
    },
    personAvatar: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    personAvatarText: { color: tokens.text1, fontSize: 12, fontWeight: "700" },
    personName: { color: tokens.text1, fontSize: 15, fontWeight: "500" },
    personMeta: {
      color: tokens.text2,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    check: {
      alignItems: "center",
      borderColor: tokens.hairline,
      borderRadius: 8,
      borderWidth: 1,
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    checkOn: {
      backgroundColor: tokens.buttonPrimaryBackground,
      borderColor: tokens.buttonPrimaryBackground,
    },
    checkText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "700",
    },
    privacyNote: {
      alignItems: "flex-start",
      backgroundColor: tokens.surface2,
      borderRadius: 16,
      flexDirection: "row",
      gap: 10,
      marginTop: 22,
      padding: 14,
    },
    privacyNoteIcon: { color: tokens.gain, fontSize: 16, fontWeight: "700" },
    privacyNoteText: {
      color: tokens.text2,
      flex: 1,
      fontSize: 15,
      lineHeight: 22,
    },
    error: {
      color: tokens.loss,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 18,
      marginTop: 14,
    },
    footer: {
      backgroundColor: tokens.ground,
      borderTopColor: tokens.hairline,
      borderTopWidth: 1,
      bottom: 0,
      left: 0,
      padding: 14,
      position: "absolute",
      right: 0,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 20,
    },
    primaryButtonText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "700",
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 16,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 54,
      paddingHorizontal: 20,
    },
    secondaryButtonText: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "500",
    },
    disabled: { opacity: 0.5 },
    savedPage: {
      alignItems: "center",
      flexGrow: 1,
      justifyContent: "center",
      padding: 24,
    },
    savedIcon: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 37,
      height: 74,
      justifyContent: "center",
      width: 74,
    },
    savedIconShared: { backgroundColor: tokens.surface2 },
    savedIconText: { color: tokens.text1, fontSize: 30, fontWeight: "700" },
    savedEyebrow: {
      color: tokens.gain,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginTop: 24,
    },
    savedTitle: {
      color: tokens.text1,
      fontSize: 31,
      fontWeight: "400",
      letterSpacing: -0.7,
      lineHeight: 36,
      marginTop: 9,
      textAlign: "center",
    },
    savedBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginVertical: 18,
      maxWidth: 520,
      textAlign: "center",
    },
    savedActions: { gap: 10, width: "100%" },
    confirmCard: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 22,
      borderWidth: 1,
      gap: 11,
      marginTop: 10,
      padding: 18,
      width: "100%",
    },
    confirmEyebrow: {
      color: tokens.flareText,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
    },
    confirmTitle: { color: tokens.text1, fontSize: 23, fontWeight: "500" },
    confirmBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 5,
    },
  });
}
