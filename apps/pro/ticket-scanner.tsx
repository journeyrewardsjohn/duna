import {
  normalizeDunaMemberId,
  parseAdmissionCredential,
  parseDunaMemberCredential,
} from "@duna/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import { useProRuntime } from "./runtime";

type ScannerMode = "player-check-in" | "fan-ticket";
type ScanState = "accepted" | "rejected" | "pending";

type MemberActivityCandidate = {
  readonly activityType: "session" | "court-booking" | "pickup";
  readonly activityId: string;
  readonly participationId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venueName: string;
};

type MemberSelection = {
  readonly payload: string;
  readonly scannedAt: string;
  readonly playerName: string;
  readonly memberId?: string;
  readonly candidates: readonly MemberActivityCandidate[];
};

type ValidationResult = Omit<ScanLedgerEntry, "id" | "scannedAt"> & {
  readonly selection?: MemberSelection;
};

type ScanLedgerEntry = {
  readonly id: string;
  readonly mode: ScannerMode;
  readonly state: ScanState;
  readonly headline: string;
  readonly detail: string;
  readonly scannedAt: string;
  readonly payload?: string;
};

export type ScannerPalette = {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly positive: string;
  readonly warning: string;
  readonly danger: string;
  readonly overlay: string;
};

const deviceKey = "duna-pro-scanner-device-v1";
const ledgerKey = "duna-pro-scanner-ledger-v1";

function connectivityFailure(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return /network|fetch|offline|connection|timed out|timeout/i.test(message);
}

async function persistLedger(entries: readonly ScanLedgerEntry[]) {
  await AsyncStorage.setItem(ledgerKey, JSON.stringify(entries.slice(0, 100)));
}

function toLedgerValidation(
  validation: ValidationResult,
): Omit<ScanLedgerEntry, "id" | "scannedAt"> {
  return {
    mode: validation.mode,
    state: validation.state,
    headline: validation.headline,
    detail: validation.detail,
    payload: validation.payload,
  };
}

export function TicketScannerScreen({
  onClose,
  palette,
}: {
  readonly onClose: () => void;
  readonly palette: ScannerPalette;
}) {
  const { client, mode: runtimeMode, refresh } = useProRuntime();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ScannerMode>("player-check-in");
  const [deviceId, setDeviceId] = useState<string>();
  const [ledger, setLedger] = useState<readonly ScanLedgerEntry[]>([]);
  const [result, setResult] = useState<ScanLedgerEntry>();
  const [locked, setLocked] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [memberSelection, setMemberSelection] = useState<MemberSelection>();

  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem(deviceKey),
      AsyncStorage.getItem(ledgerKey),
    ]).then(async ([storedDevice, storedLedger]) => {
      const nextDevice = storedDevice || Crypto.randomUUID();
      if (!storedDevice) await AsyncStorage.setItem(deviceKey, nextDevice);
      setDeviceId(nextDevice);
      if (storedLedger) {
        try {
          const parsed = JSON.parse(storedLedger) as unknown;
          if (Array.isArray(parsed)) {
            setLedger(
              (parsed as readonly (ScanLedgerEntry & { mode: string })[]).map(
                (entry) => ({
                  ...entry,
                  mode:
                    entry.mode === "fan-ticket"
                      ? ("fan-ticket" as const)
                      : ("player-check-in" as const),
                }),
              ),
            );
          }
        } catch {
          // Invalid local history is discarded; server scan ledgers remain intact.
        }
      }
    });
  }, []);

  async function validate(
    payload: string,
    expectedMode: ScannerMode,
    scannedAt: string,
    offline: boolean,
    selectedActivity?: MemberActivityCandidate,
  ): Promise<ValidationResult> {
    const credential = parseAdmissionCredential(payload);
    const memberCredential = parseDunaMemberCredential(payload);
    const memberId = normalizeDunaMemberId(payload);
    if (!client || runtimeMode !== "live" || !deviceId) {
      return {
        mode: expectedMode,
        state: "rejected",
        headline: "Live validation unavailable",
        detail: "Sign in to the event organization before admitting anyone.",
      };
    }
    if (expectedMode === "player-check-in") {
      if (memberCredential || memberId) {
        const member = await client.operator.scanDunaMember.mutate({
          credential: payload,
          selectedActivityType: selectedActivity?.activityType,
          selectedActivityId: selectedActivity?.activityId,
          deviceId,
          scannedAt,
          offline,
          idempotencyKey: Crypto.randomUUID(),
        });
        if (member.selectionRequired) {
          return {
            mode: expectedMode,
            state: "pending",
            headline: member.playerName ?? "Choose today’s activity",
            detail: "This member is expected at more than one activity.",
            selection: {
              payload,
              scannedAt,
              playerName: member.playerName ?? "Duna member",
              memberId: member.memberId,
              candidates: member.candidates,
            },
          };
        }
        return {
          mode: expectedMode,
          state: member.accepted ? "accepted" : "rejected",
          headline: member.accepted
            ? (member.playerName ?? "Member checked in")
            : member.duplicate
              ? "Player already checked in"
              : (member.playerName ?? "Membership not valid here"),
          detail: member.accepted
            ? `${member.activity?.title ?? "Today’s activity"} · universal member check-in recorded`
            : `${member.reason?.replaceAll("-", " ") ?? "not registered for an activity today"} · no entry granted`,
        };
      }
      if (!credential) {
        return {
          mode: expectedMode,
          state: "rejected",
          headline: "Not a Duna player credential",
          detail:
            "Scan a Duna Membership QR, player registration QR, or enter the 6-character Member ID.",
        };
      }
      if (credential.kind !== "player-registration") {
        return {
          mode: expectedMode,
          state: "rejected",
          headline: "This is a fan ticket",
          detail: "Switch to Ticket validator for spectator admission.",
        };
      }
      const registration = await client.operator.scanPlayerRegistration.mutate({
        registrationId: credential.token,
        deviceId,
        scannedAt,
        offline,
        idempotencyKey: Crypto.randomUUID(),
      });
      return {
        mode: expectedMode,
        state: registration.accepted ? "accepted" : "rejected",
        headline: registration.accepted
          ? registration.playerName
          : registration.duplicate
            ? "Player already checked in"
            : "Registration not valid",
        detail: registration.accepted
          ? `${registration.eventTitle} · attendance and scan ledger recorded`
          : `${registration.reason?.replaceAll("-", " ") ?? registration.registrationStatus} · scan logged`,
      };
    }
    if (memberCredential || memberId) {
      return {
        mode: expectedMode,
        state: "rejected",
        headline: "This is a Duna Membership",
        detail: "Switch to Player check-in for this credential.",
      };
    }
    if (!credential) {
      return {
        mode: expectedMode,
        state: "rejected",
        headline: "Not a Duna fan ticket",
        detail: "Use the individual QR from Apple Wallet or the ticket email.",
      };
    }
    if (credential.kind !== "fan-ticket") {
      return {
        mode: expectedMode,
        state: "rejected",
        headline: "This is a player registration",
        detail: "Switch to Player check-in for this credential.",
      };
    }
    const ticket = await client.operator.scanTicket.mutate({
      ticketToken: credential.token,
      deviceId,
      scannedAt,
      offline,
      idempotencyKey: Crypto.randomUUID(),
    });
    return {
      mode: expectedMode,
      state: ticket.accepted ? "accepted" : "rejected",
      headline: ticket.accepted
        ? (ticket.ownerName ?? "Ticket valid")
        : ticket.duplicate
          ? "Ticket already used"
          : "Ticket not valid",
      detail: ticket.accepted
        ? `${ticket.ticketName ?? "Admission"} · ${ticket.eventTitle ?? "Duna event"}`
        : `${ticket.reason?.replaceAll("-", " ") ?? ticket.ticketStatus} · scan logged`,
    };
  }

  async function recordPayload(
    payload: string,
    selectedActivity?: MemberActivityCandidate,
  ) {
    if ((locked && !selectedActivity) || !payload.trim()) return;
    const scannedAt = new Date().toISOString();
    setLocked(true);
    setMemberSelection(undefined);
    let next: ScanLedgerEntry;
    try {
      const validation = await validate(
        payload.trim(),
        mode,
        selectedActivity
          ? (memberSelection?.scannedAt ?? scannedAt)
          : scannedAt,
        false,
        selectedActivity,
      );
      if (validation.selection) {
        setMemberSelection(validation.selection);
        setResult(undefined);
        return;
      }
      next = {
        id: Crypto.randomUUID(),
        scannedAt,
        ...toLedgerValidation(validation),
      };
      if (validation.state === "accepted") {
        if (Platform.OS !== "web")
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        await refresh();
      } else if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (reason) {
      const pending = connectivityFailure(reason);
      next = {
        id: Crypto.randomUUID(),
        mode,
        state: pending ? "pending" : "rejected",
        headline: pending ? "Awaiting secure validation" : "Not admitted",
        detail: pending
          ? "No entry was granted. Retry when this device reconnects."
          : reason instanceof Error
            ? reason.message
            : "Duna could not validate this credential.",
        scannedAt,
        payload: pending ? payload.trim() : undefined,
      };
    }
    const nextLedger = [next, ...ledger].slice(0, 100);
    setLedger(nextLedger);
    setResult(next);
    setManualValue("");
    await persistLedger(nextLedger);
  }

  async function retryPending() {
    if (!ledger.some((entry) => entry.state === "pending")) return;
    setSyncing(true);
    const nextLedger: ScanLedgerEntry[] = [];
    for (const entry of ledger) {
      if (entry.state !== "pending" || !entry.payload) {
        nextLedger.push(entry);
        continue;
      }
      try {
        const validation = await validate(
          entry.payload,
          entry.mode,
          entry.scannedAt,
          true,
        );
        if (validation.selection) {
          nextLedger.push(entry);
          continue;
        }
        nextLedger.push({
          ...entry,
          ...toLedgerValidation(validation),
          payload: undefined,
        });
      } catch {
        nextLedger.push(entry);
      }
    }
    setLedger(nextLedger);
    await persistLedger(nextLedger);
    await refresh().catch(() => undefined);
    setSyncing(false);
  }

  const totals = {
    accepted: ledger.filter((entry) => entry.state === "accepted").length,
    rejected: ledger.filter((entry) => entry.state === "rejected").length,
    pending: ledger.filter((entry) => entry.state === "pending").length,
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close scanner"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DUNA PRO · CHECK-IN</Text>
          <Text style={styles.title}>One scan. The right activity.</Text>
        </View>
        <Pressable
          onPress={() => setTorch((current) => !current)}
          style={styles.torch}
        >
          <Text style={styles.torchText}>{torch ? "Light on" : "Light"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              setMode("player-check-in");
              setResult(undefined);
              setMemberSelection(undefined);
              setLocked(false);
            }}
            style={[
              styles.mode,
              mode === "player-check-in" && styles.modeActive,
            ]}
          >
            <Text
              style={[
                styles.modeText,
                mode === "player-check-in" && styles.modeTextActive,
              ]}
            >
              Player check-in
            </Text>
            <Text style={styles.modeMeta}>
              Membership, registration, or Member ID
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode("fan-ticket");
              setResult(undefined);
              setMemberSelection(undefined);
              setLocked(false);
            }}
            style={[styles.mode, mode === "fan-ticket" && styles.modeActive]}
          >
            <Text
              style={[
                styles.modeText,
                mode === "fan-ticket" && styles.modeTextActive,
              ]}
            >
              Ticket validator
            </Text>
            <Text style={styles.modeMeta}>Fan admission QR</Text>
          </Pressable>
        </View>

        <View style={styles.cameraShell}>
          {!permission ? (
            <ActivityIndicator color={palette.accent} />
          ) : !permission.granted ? (
            <View style={styles.permission}>
              <Text style={styles.permissionTitle}>
                Camera permission needed
              </Text>
              <Text style={styles.permissionBody}>
                Duna Pro uses the camera only while this validator is open.
              </Text>
              <Pressable
                onPress={() => void requestPermission()}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>Allow camera</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              enableTorch={torch}
              facing="back"
              onBarcodeScanned={
                locked ? undefined : ({ data }) => void recordPayload(data)
              }
              style={styles.camera}
            >
              <View style={styles.cameraVeil}>
                <View style={styles.scanFrame} />
                <Text style={styles.cameraGuide}>
                  {mode === "player-check-in"
                    ? "Scan Duna Membership or registration QR"
                    : "Center one individual fan ticket QR"}
                </Text>
              </View>
            </CameraView>
          )}
          {result && (
            <View
              style={[
                styles.result,
                result.state === "accepted"
                  ? styles.resultAccepted
                  : result.state === "pending"
                    ? styles.resultPending
                    : styles.resultRejected,
              ]}
            >
              <Text style={styles.resultMark}>
                {result.state === "accepted"
                  ? "✓"
                  : result.state === "pending"
                    ? "…"
                    : "×"}
              </Text>
              <View style={styles.flex}>
                <Text style={styles.resultTitle}>{result.headline}</Text>
                <Text style={styles.resultBody}>{result.detail}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setResult(undefined);
                  setLocked(false);
                }}
                style={styles.next}
              >
                <Text style={styles.nextText}>Scan next</Text>
              </Pressable>
            </View>
          )}
        </View>

        {memberSelection && (
          <View style={styles.selection}>
            <Text style={styles.sectionLabel}>CHOOSE TODAY’S ACTIVITY</Text>
            <Text style={styles.selectionTitle}>
              Where is {memberSelection.playerName} checking in?
            </Text>
            {memberSelection.memberId && (
              <Text style={styles.selectionMeta}>
                Duna Member {memberSelection.memberId}
              </Text>
            )}
            {memberSelection.candidates.map((candidate) => (
              <Pressable
                key={`${candidate.activityType}:${candidate.activityId}`}
                onPress={() =>
                  void recordPayload(memberSelection.payload, candidate)
                }
                style={styles.selectionOption}
              >
                <View style={styles.flex}>
                  <Text style={styles.selectionOptionTitle}>
                    {candidate.title}
                  </Text>
                  <Text style={styles.selectionMeta}>
                    {new Date(candidate.startsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    · {candidate.venueName}
                  </Text>
                </View>
                <Text style={styles.selectionArrow}>›</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setMemberSelection(undefined);
                setLocked(false);
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.manual}>
          <Text style={styles.sectionLabel}>CAMERA TROUBLE?</Text>
          <TextInput
            autoCapitalize={mode === "player-check-in" ? "characters" : "none"}
            onChangeText={setManualValue}
            placeholder={
              mode === "player-check-in"
                ? "Enter 6-character Member ID or paste credential"
                : "Paste the Duna ticket credential"
            }
            placeholderTextColor={palette.muted}
            style={styles.input}
            value={manualValue}
          />
          <Pressable
            disabled={!manualValue.trim() || locked}
            onPress={() => void recordPayload(manualValue)}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Validate manually</Text>
          </Pressable>
        </View>

        <View style={styles.ledgerHeader}>
          <View>
            <Text style={styles.sectionLabel}>THIS DEVICE</Text>
            <Text style={styles.ledgerTitle}>Admission activity</Text>
          </View>
          {totals.pending > 0 && (
            <Pressable
              disabled={syncing}
              onPress={() => void retryPending()}
              style={styles.sync}
            >
              <Text style={styles.syncText}>
                {syncing ? "Retrying…" : `Retry ${totals.pending}`}
              </Text>
            </Pressable>
          )}
        </View>
        <View style={styles.metrics}>
          <View>
            <Text style={styles.metricValue}>{totals.accepted}</Text>
            <Text style={styles.metricLabel}>Accepted</Text>
          </View>
          <View>
            <Text style={styles.metricValue}>{totals.rejected}</Text>
            <Text style={styles.metricLabel}>Rejected</Text>
          </View>
          <View>
            <Text style={styles.metricValue}>{totals.pending}</Text>
            <Text style={styles.metricLabel}>Pending</Text>
          </View>
        </View>
        <View style={styles.ledger}>
          {ledger.slice(0, 12).map((entry) => (
            <View key={entry.id} style={styles.ledgerRow}>
              <Text
                style={[
                  styles.ledgerMark,
                  entry.state === "accepted"
                    ? styles.positiveText
                    : entry.state === "pending"
                      ? styles.warningText
                      : styles.dangerText,
                ]}
              >
                {entry.state === "accepted"
                  ? "✓"
                  : entry.state === "pending"
                    ? "…"
                    : "×"}
              </Text>
              <View style={styles.flex}>
                <Text style={styles.ledgerRowTitle}>{entry.headline}</Text>
                <Text style={styles.ledgerRowMeta}>
                  {entry.mode === "player-check-in" ? "Player" : "Ticket"} ·{" "}
                  {new Date(entry.scannedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          ))}
          {ledger.length === 0 && (
            <Text style={styles.empty}>
              Validated scans appear here and in Duna’s server ledger.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ScannerPalette) {
  return StyleSheet.create({
    screen: { backgroundColor: palette.canvas, flex: 1 },
    flex: { flex: 1 },
    header: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    close: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    closeText: { color: palette.text, fontSize: 25, lineHeight: 28 },
    eyebrow: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    title: {
      color: palette.text,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 3,
    },
    torch: {
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      padding: 10,
    },
    torchText: { color: palette.text, fontSize: 12, fontWeight: "800" },
    content: { gap: 14, padding: 14, paddingBottom: 40 },
    modeRow: { flexDirection: "row", gap: 8 },
    mode: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 15,
      borderWidth: 1,
      flex: 1,
      minHeight: 64,
      padding: 11,
    },
    modeActive: { borderColor: palette.accent },
    modeText: { color: palette.muted, fontSize: 13, fontWeight: "900" },
    modeTextActive: { color: palette.accent },
    modeMeta: { color: palette.muted, fontSize: 12, marginTop: 4 },
    cameraShell: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 390,
      overflow: "hidden",
      position: "relative",
    },
    camera: { height: 390, width: "100%" },
    cameraVeil: {
      alignItems: "center",
      backgroundColor: palette.overlay,
      flex: 1,
      justifyContent: "center",
    },
    scanFrame: {
      borderColor: palette.accent,
      borderRadius: 24,
      borderWidth: 3,
      height: 230,
      width: 230,
    },
    cameraGuide: {
      color: palette.text,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 20,
    },
    permission: { alignItems: "center", gap: 10, padding: 24 },
    permissionTitle: { color: palette.text, fontSize: 19, fontWeight: "900" },
    permissionBody: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
    },
    primary: {
      backgroundColor: palette.accent,
      borderRadius: 13,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryText: { color: palette.onAccent, fontSize: 13, fontWeight: "900" },
    result: {
      alignItems: "center",
      bottom: 0,
      flexDirection: "row",
      gap: 10,
      left: 0,
      padding: 14,
      position: "absolute",
      right: 0,
    },
    resultAccepted: { backgroundColor: palette.positive },
    resultPending: { backgroundColor: palette.warning },
    resultRejected: { backgroundColor: palette.danger },
    resultMark: { color: palette.onAccent, fontSize: 25, fontWeight: "900" },
    resultTitle: { color: palette.onAccent, fontSize: 15, fontWeight: "900" },
    resultBody: {
      color: palette.onAccent,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 2,
    },
    next: {
      borderColor: palette.onAccent,
      borderRadius: 10,
      borderWidth: 1,
      padding: 9,
    },
    nextText: { color: palette.onAccent, fontSize: 12, fontWeight: "900" },
    selection: {
      backgroundColor: palette.surface,
      borderColor: palette.accent,
      borderRadius: 17,
      borderWidth: 1,
      gap: 8,
      padding: 13,
    },
    selectionTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: "900",
    },
    selectionMeta: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 16,
    },
    selectionOption: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 58,
      padding: 11,
    },
    selectionOptionTitle: {
      color: palette.text,
      fontSize: 13,
      fontWeight: "900",
    },
    selectionArrow: {
      color: palette.accent,
      fontSize: 24,
      fontWeight: "900",
    },
    manual: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 17,
      borderWidth: 1,
      gap: 8,
      padding: 13,
    },
    sectionLabel: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    input: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      color: palette.text,
      fontSize: 15,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    secondary: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 46,
    },
    secondaryText: { color: palette.text, fontSize: 12, fontWeight: "900" },
    ledgerHeader: {
      alignItems: "flex-end",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    ledgerTitle: {
      color: palette.text,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 3,
    },
    sync: {
      borderColor: palette.warning,
      borderRadius: 11,
      borderWidth: 1,
      padding: 9,
    },
    syncText: { color: palette.warning, fontSize: 12, fontWeight: "900" },
    metrics: { flexDirection: "row", gap: 8 },
    metricValue: { color: palette.text, fontSize: 24, fontWeight: "900" },
    metricLabel: { color: palette.muted, fontSize: 12, marginTop: 2 },
    ledger: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 17,
      borderWidth: 1,
    },
    ledgerRow: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 62,
      padding: 11,
    },
    ledgerMark: { fontSize: 20, fontWeight: "900", width: 25 },
    positiveText: { color: palette.positive },
    warningText: { color: palette.warning },
    dangerText: { color: palette.danger },
    ledgerRowTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
    ledgerRowMeta: { color: palette.muted, fontSize: 12, marginTop: 3 },
    empty: { color: palette.muted, fontSize: 12, lineHeight: 18, padding: 15 },
  });
}
