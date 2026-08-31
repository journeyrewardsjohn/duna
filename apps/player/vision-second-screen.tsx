import type { VisionSession, VisionSessionSettings } from "@duna/api";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DunaApiClient } from "./mobile-api";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";

function initialScore(settings: VisionSessionSettings) {
  return (
    settings.program?.score ?? {
      setIndex: 0,
      sets: [{ a: 0, b: 0 }],
      status: "not-started" as const,
    }
  );
}

export function VisionSecondScreen({
  client,
  onClose,
  token,
}: {
  readonly client: DunaApiClient;
  readonly onClose: () => void;
  readonly token: string;
}) {
  const [session, setSession] = useState<VisionSession>();
  const [settings, setSettings] = useState<VisionSessionSettings>();
  const [sponsorHeadline, setSponsorHeadline] = useState("");
  const [sponsorBody, setSponsorBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const busyRef = useRef(false);
  const sponsorEditing = useRef(false);
  busyRef.current = busy;

  const adopt = (next: VisionSession, syncSponsorDraft = true) => {
    setSession(next);
    setSettings(next.settings);
    if (syncSponsorDraft && !sponsorEditing.current) {
      setSponsorHeadline(next.settings.program?.sponsor?.headline ?? "");
      setSponsorBody(next.settings.program?.sponsor?.body ?? "");
    }
  };

  const refresh = async () => {
    const next = await client.public.visionRemoteSession.query({ token });
    adopt(next);
    return next;
  };

  useEffect(() => {
    let active = true;
    void client.public.visionRemoteSession
      .query({ token })
      .then((next) => {
        if (active) adopt(next);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "This second-screen link is unavailable.",
          );
        }
      });
    const timer = setInterval(() => {
      if (busyRef.current) return;
      void client.public.visionRemoteSession
        .query({ token })
        .then((next) => {
          if (active) adopt(next, false);
        })
        .catch(() => undefined);
    }, 2_500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, token]);

  const commit = async (
    nextSettings: VisionSessionSettings,
    message: string,
    status?: "setup" | "ready" | "recording" | "ended",
  ) => {
    if (!session || busy) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const next = await client.public.updateVisionRemoteSession.mutate({
        token,
        expectedVersion: session.controlVersion,
        settings: nextSettings,
        status,
      });
      adopt(next);
      setNotice(message);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The camera did not accept that command.",
      );
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const awardRally = (winnerSide: "A" | "B") => {
    if (!settings) return;
    const score = initialScore(settings);
    const sets = score.sets.map((set) => ({ ...set }));
    const setIndex = Math.min(score.setIndex, sets.length - 1);
    const current = sets[setIndex] ?? { a: 0, b: 0 };
    sets[setIndex] = {
      a: current.a + (winnerSide === "A" ? 1 : 0),
      b: current.b + (winnerSide === "B" ? 1 : 0),
    };
    const occurredAt = new Date().toISOString();
    const nextSettings: VisionSessionSettings = {
      ...settings,
      program: {
        ...settings.program,
        scoreboardVisible: settings.program?.scoreboardVisible ?? true,
        score: {
          setIndex,
          sets,
          serving: winnerSide,
          status: "live",
        },
        scoreCommand: {
          id: Crypto.randomUUID(),
          type: "rally-won",
          winnerSide,
          occurredAt,
        },
      },
    };
    void commit(
      nextSettings,
      `${winnerSide === "A" ? settings.teamA : settings.teamB} +1`,
    );
  };

  const requestReplay = (durationSeconds: number) => {
    if (!settings) return;
    void commit(
      {
        ...settings,
        program: {
          ...settings.program,
          scoreboardVisible: settings.program?.scoreboardVisible ?? true,
          replayRequest: {
            id: Crypto.randomUUID(),
            durationSeconds,
            requestedAt: new Date().toISOString(),
          },
        },
      },
      `${durationSeconds}-second replay sent to camera.`,
    );
  };

  const takeSponsor = () => {
    if (!settings || !sponsorHeadline.trim()) return;
    const currentlyActive = settings.program?.sponsor?.active ?? false;
    void commit(
      {
        ...settings,
        program: {
          ...settings.program,
          scoreboardVisible: settings.program?.scoreboardVisible ?? true,
          sponsor: {
            id: currentlyActive
              ? (settings.program?.sponsor?.id ?? Crypto.randomUUID())
              : Crypto.randomUUID(),
            headline: sponsorHeadline.trim(),
            body: sponsorBody.trim() || undefined,
            active: !currentlyActive,
          },
        },
      },
      currentlyActive
        ? "Sponsor graphic returned."
        : "Sponsor graphic is live.",
    );
  };

  const closed = session?.status === "ended" || session?.status === "expired";
  const recording = session?.status === "recording";
  const score = settings ? initialScore(settings) : undefined;
  const currentSet =
    score?.sets[Math.min(score.setIndex, score.sets.length - 1)];

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.safe}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>DUNA SECOND SCREEN</Text>
              <Text numberOfLines={1} style={styles.title}>
                {session?.title ?? "Connecting to camera…"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>

          {!session || !settings ? (
            <View style={styles.loading}>
              {error ? (
                <>
                  <Text style={styles.error}>{error}</Text>
                  <Pressable
                    onPress={() => void refresh()}
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>Try again</Text>
                  </Pressable>
                </>
              ) : (
                <ActivityIndicator color="#4adbd0" size="large" />
              )}
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.statusRow}>
                <View
                  style={[styles.statusDot, recording && styles.statusDotLive]}
                />
                <Text style={styles.statusText}>
                  {recording
                    ? "CAMERA IS LIVE"
                    : closed
                      ? "SESSION ENDED"
                      : "CAMERA READY"}
                </Text>
                {busy && <ActivityIndicator color="#4adbd0" size="small" />}
              </View>

              {session.previewDataUrl ? (
                <Image
                  source={{ uri: session.previewDataUrl }}
                  style={styles.preview}
                />
              ) : (
                <View style={[styles.preview, styles.previewEmpty]}>
                  <Text style={styles.previewEmptyText}>
                    Camera preview is warming up
                  </Text>
                </View>
              )}

              <View style={styles.card}>
                <View style={styles.cardHeading}>
                  <View>
                    <Text style={styles.cardEyebrow}>LIVE SCORE</Text>
                    <Text style={styles.cardTitle}>
                      Set {(score?.setIndex ?? 0) + 1}
                    </Text>
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>On stream</Text>
                    <Switch
                      disabled={busy || closed}
                      onValueChange={(scoreboardVisible) =>
                        void commit(
                          {
                            ...settings,
                            program: {
                              ...settings.program,
                              scoreboardVisible,
                              score,
                            },
                          },
                          scoreboardVisible
                            ? "Scoreboard is live."
                            : "Scoreboard hidden.",
                        )
                      }
                      value={settings.program?.scoreboardVisible ?? true}
                    />
                  </View>
                </View>
                {(
                  [
                    ["A", settings.teamA, currentSet?.a ?? 0],
                    ["B", settings.teamB, currentSet?.b ?? 0],
                  ] as const
                ).map(([side, name, points]) => (
                  <Pressable
                    disabled={busy || closed}
                    key={side}
                    onPress={() => awardRally(side)}
                    style={styles.scoreRow}
                  >
                    <Text numberOfLines={1} style={styles.teamName}>
                      {name}
                    </Text>
                    <Text style={styles.points}>{points}</Text>
                    <View style={styles.plus}>
                      <Text style={styles.plusText}>+1</Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>INSTANT REPLAY</Text>
                <Text style={styles.cardTitle}>Replay the last rally</Text>
                <Text style={styles.body}>
                  The camera keeps a short rolling buffer. Court audio remains
                  live beneath the replay.
                </Text>
                <View style={styles.buttonRow}>
                  {[8, 10, 15].map((seconds) => (
                    <Pressable
                      disabled={busy || !recording}
                      key={seconds}
                      onPress={() => requestReplay(seconds)}
                      style={[
                        styles.secondaryAction,
                        !recording && styles.disabled,
                      ]}
                    >
                      <Text style={styles.secondaryActionText}>
                        {seconds}s replay
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardEyebrow}>SPONSOR MESSAGE</Text>
                <Text style={styles.cardTitle}>Take a lower-third ad</Text>
                <TextInput
                  editable={!busy && !closed}
                  maxLength={80}
                  onChangeText={setSponsorHeadline}
                  onBlur={() => {
                    sponsorEditing.current = false;
                  }}
                  onFocus={() => {
                    sponsorEditing.current = true;
                  }}
                  placeholder="Presented by…"
                  placeholderTextColor="#71808c"
                  style={styles.input}
                  value={sponsorHeadline}
                />
                <TextInput
                  editable={!busy && !closed}
                  maxLength={160}
                  onChangeText={setSponsorBody}
                  onBlur={() => {
                    sponsorEditing.current = false;
                  }}
                  onFocus={() => {
                    sponsorEditing.current = true;
                  }}
                  placeholder="Optional offer or message"
                  placeholderTextColor="#71808c"
                  style={styles.input}
                  value={sponsorBody}
                />
                <Pressable
                  disabled={busy || closed || !sponsorHeadline.trim()}
                  onPress={takeSponsor}
                  style={[
                    styles.action,
                    !sponsorHeadline.trim() && styles.disabled,
                  ]}
                >
                  <Text style={styles.actionText}>
                    {settings.program?.sponsor?.active
                      ? "Return graphic"
                      : "Take graphic live"}
                  </Text>
                </Pressable>
              </View>

              {!!notice && <Text style={styles.notice}>{notice}</Text>}
              {!!error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                disabled={busy || closed}
                onPress={() =>
                  void commit(
                    settings,
                    recording ? "End command sent." : "Start command sent.",
                    recording ? "ended" : "recording",
                  )
                }
                style={[
                  styles.startStop,
                  recording && styles.end,
                  closed && styles.disabled,
                ]}
              >
                <Text style={styles.startStopText}>
                  {recording ? "End broadcast" : "Start broadcast"}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#071625", flex: 1 },
  header: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  eyebrow: {
    color: "#4adbd0",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 3,
    maxWidth: 270,
  },
  close: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  closeText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 28,
  },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  statusDot: {
    backgroundColor: "#86939d",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  statusDotLive: { backgroundColor: "#f16c4d" },
  statusText: {
    color: "#ffffff",
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  preview: {
    aspectRatio: 16 / 9,
    backgroundColor: "#02070b",
    borderRadius: 18,
    width: "100%",
  },
  previewEmpty: { alignItems: "center", justifyContent: "center" },
  previewEmptyText: { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  card: {
    backgroundColor: "#102637",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 11,
    padding: 16,
  },
  cardHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardEyebrow: {
    color: "#d9bd83",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 3,
  },
  body: { color: "rgba(255,255,255,0.64)", fontSize: 13, lineHeight: 19 },
  switchRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  switchLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "700",
  },
  scoreRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    padding: 10,
  },
  teamName: { color: "#ffffff", flex: 1, fontSize: 16, fontWeight: "800" },
  points: {
    color: "#ffffff",
    fontSize: 30,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    minWidth: 48,
    textAlign: "right",
  },
  plus: {
    alignItems: "center",
    backgroundColor: "#4adbd0",
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 50,
  },
  plusText: { color: "#071625", fontSize: 15, fontWeight: "900" },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryAction: {
    alignItems: "center",
    backgroundColor: "rgba(74,219,208,0.13)",
    borderColor: "rgba(74,219,208,0.45)",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    minWidth: 90,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  secondaryActionText: { color: "#baf6f1", fontSize: 13, fontWeight: "800" },
  input: {
    backgroundColor: "#071625",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 12,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  action: {
    alignItems: "center",
    backgroundColor: "#4adbd0",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 50,
  },
  actionText: { color: "#071625", fontSize: 15, fontWeight: "900" },
  startStop: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 58,
  },
  end: { backgroundColor: "#f16c4d" },
  startStopText: { color: "#071625", fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.38 },
  notice: {
    color: "#baf6f1",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  error: {
    color: "#ffb4a3",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
