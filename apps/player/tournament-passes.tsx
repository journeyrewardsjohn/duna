import type { DunaApiClient } from "./mobile-api";
import { dunaWebUrl } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";
import QRCode from "react-native-qrcode-svg";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FellixText as Text } from "./fellix-text";

export type AdmissionPass = Awaited<
  ReturnType<DunaApiClient["player"]["admissionPasses"]["query"]>
>[number];

type AdmissionPassKind = AdmissionPass["kind"];

async function openWalletPass(input: {
  readonly client: DunaApiClient;
  readonly passId: string;
}): Promise<readonly AdmissionPass[]> {
  const freshPasses = await input.client.player.admissionPasses.query();
  const freshPass = freshPasses.find(
    (candidate) => candidate.id === input.passId,
  );
  if (!freshPass?.walletPassPath) {
    throw new Error("wallet-pass-not-ready");
  }
  await Linking.openURL(`${dunaWebUrl}${freshPass.walletPassPath}`);
  return freshPasses;
}

function walletButtonLabel(
  pass: AdmissionPass,
  index: number,
  total: number,
): string {
  if (total === 1) return "Add to Apple Wallet";
  return pass.kind === "fan-ticket"
    ? `Add ticket ${index + 1} to Apple Wallet`
    : `Add player pass ${index + 1} to Apple Wallet`;
}

export type TournamentPassPalette = {
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly playerAccent: string;
  readonly fanAccent: string;
  readonly positive: string;
  readonly warning: string;
  readonly button: string;
  readonly onButton: string;
  readonly qrBackground: string;
  readonly qrForeground: string;
};

function passDate(pass: AdmissionPass): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: pass.timezone,
  }).format(new Date(pass.startsAt));
}

export function TournamentPasses({
  palette,
}: {
  readonly palette: TournamentPassPalette;
}) {
  const { client, mode } = usePlayerRuntime();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [passes, setPasses] = useState<readonly AdmissionPass[]>([]);
  const [expandedId, setExpandedId] = useState<string>();
  const [loaded, setLoaded] = useState(mode === "preview");
  const [walletBusyId, setWalletBusyId] = useState<string>();
  const [walletMessage, setWalletMessage] = useState<string>();
  const supportsAppleWallet = Platform.OS === "ios" || Platform.OS === "web";

  useEffect(() => {
    if (!client || mode === "preview") return;
    let active = true;
    void client.player.admissionPasses
      .query()
      .then((nextPasses) => {
        if (!active) return;
        setPasses(nextPasses);
        setExpandedId((current) => current ?? nextPasses[0]?.id);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [client, mode]);

  async function addToAppleWallet(pass: AdmissionPass) {
    if (!client || mode !== "live") return;
    setWalletBusyId(pass.id);
    setWalletMessage(undefined);
    try {
      const freshPasses = await openWalletPass({ client, passId: pass.id });
      setPasses(freshPasses);
    } catch {
      setWalletMessage(
        "Apple Wallet did not open. Your secure Duna QR remains ready here.",
      );
    } finally {
      setWalletBusyId(undefined);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.shell}>
        <ActivityIndicator color={palette.playerAccent} />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerMark}>
          <Text style={styles.headerMarkText}>⌁</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>TOURNAMENT ADMISSION</Text>
          <Text style={styles.title}>Your passes</Text>
          <Text style={styles.body}>
            Player check-in and fan admission use separate, individual QR codes.
          </Text>
        </View>
      </View>

      {passes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No upcoming tournament passes.</Text>
          <Text style={styles.body}>
            Confirmed registrations and purchased tickets appear here
            automatically.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {passes.map((pass) => {
            const isPlayer = pass.kind === "player-registration";
            const expanded = expandedId === pass.id;
            const accent = isPlayer ? palette.playerAccent : palette.fanAccent;
            return (
              <View
                key={`${pass.kind}:${pass.id}`}
                style={[styles.pass, { borderTopColor: accent }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setExpandedId(expanded ? undefined : pass.id)}
                  style={styles.passTop}
                >
                  <View style={[styles.kindMark, { backgroundColor: accent }]}>
                    <Text style={styles.kindMarkText}>
                      {isPlayer ? "P" : "T"}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.kind, { color: accent }]}>
                      {isPlayer ? "PLAYER REGISTRATION" : "FAN TICKET"}
                    </Text>
                    <Text style={styles.eventTitle}>{pass.eventTitle}</Text>
                    <Text style={styles.meta}>
                      {passDate(pass)} · {pass.venueName}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{expanded ? "−" : "+"}</Text>
                </Pressable>

                {expanded && (
                  <View style={styles.passDetail}>
                    <View style={styles.qrShell}>
                      <QRCode
                        backgroundColor={palette.qrBackground}
                        color={palette.qrForeground}
                        size={190}
                        value={pass.credentialPayload}
                      />
                    </View>
                    <Text style={styles.holder}>{pass.holderName}</Text>
                    <Text style={styles.passLabel}>{pass.passLabel}</Text>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: pass.usable
                              ? palette.positive
                              : palette.warning,
                          },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        {pass.usable
                          ? isPlayer
                            ? "Ready for player check-in"
                            : "Ready for fan admission"
                          : pass.status === "checked-in"
                            ? "Player already checked in"
                            : "Ticket already scanned"}
                      </Text>
                    </View>
                    {supportsAppleWallet &&
                      pass.walletStatus === "available" && (
                        <Pressable
                          accessibilityHint="Opens the signed tournament pass in Apple Wallet"
                          accessibilityLabel="Add tournament pass to Apple Wallet"
                          disabled={walletBusyId === pass.id || !pass.usable}
                          onPress={() => void addToAppleWallet(pass)}
                          style={[
                            styles.walletButton,
                            !pass.usable && styles.walletButtonDisabled,
                          ]}
                        >
                          <Text style={styles.walletButtonText}>
                            {walletBusyId === pass.id
                              ? "Preparing pass…"
                              : "Add to Apple Wallet"}
                          </Text>
                        </Pressable>
                      )}
                    {(!supportsAppleWallet ||
                      pass.walletStatus !== "available") && (
                      <Text style={styles.walletFallback}>
                        Your secure QR is saved in Duna and ready at the gate.
                      </Text>
                    )}
                    <Text style={styles.security}>
                      One person, one credential. Duna Pro records accepted,
                      duplicate, and rejected scans in the event ledger.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      {walletMessage && (
        <Text style={styles.walletMessage}>{walletMessage}</Text>
      )}
    </View>
  );
}

export function TournamentWalletConfirmation({
  kind,
  sessionId,
}: {
  readonly kind: AdmissionPassKind;
  readonly sessionId: string;
}) {
  const { client, mode } = usePlayerRuntime();
  const [passes, setPasses] = useState<readonly AdmissionPass[]>([]);
  const [loaded, setLoaded] = useState(mode === "preview");
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!client || mode !== "live") return;
    let active = true;
    const pause = (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    void (async () => {
      for (let attempt = 0; attempt < 4 && active; attempt += 1) {
        if (attempt > 0) await pause(400 + attempt * 350);
        if (!active) return;
        try {
          const nextPasses = await client.player.admissionPasses.query();
          const matching = nextPasses.filter(
            (pass) =>
              pass.sessionId === sessionId && pass.kind === kind && pass.usable,
          );
          if (matching.length > 0) {
            setPasses(matching);
            break;
          }
        } catch {
          // The confirmation remains valid even if this optional refresh fails.
        }
      }
      if (active) setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [client, kind, mode, sessionId]);

  async function add(pass: AdmissionPass) {
    if (!client || mode !== "live") return;
    setBusyId(pass.id);
    setMessage(undefined);
    try {
      const freshPasses = await openWalletPass({ client, passId: pass.id });
      setPasses(
        freshPasses.filter(
          (candidate) =>
            candidate.sessionId === sessionId &&
            candidate.kind === kind &&
            candidate.usable,
        ),
      );
      setMessage(
        "Apple Wallet opened. Your secure Duna QR stays available as a backup.",
      );
    } catch {
      setMessage(
        "Apple Wallet did not open. Your secure Duna QR is still ready in Plans.",
      );
    } finally {
      setBusyId(undefined);
    }
  }

  if (!loaded) {
    return (
      <View style={confirmationStyles.shell}>
        <ActivityIndicator color="#203740" />
        <Text style={confirmationStyles.loading}>Preparing your pass…</Text>
      </View>
    );
  }
  if (passes.length === 0) return null;

  const walletPasses = passes.filter(
    (pass) =>
      (Platform.OS === "ios" || Platform.OS === "web") &&
      pass.walletStatus === "available",
  );
  return (
    <View style={confirmationStyles.shell}>
      <Text style={confirmationStyles.eyebrow}>TOURNAMENT ADMISSION</Text>
      <Text style={confirmationStyles.title}>Save your pass.</Text>
      <Text style={confirmationStyles.body}>
        {walletPasses.length === 0
          ? passes.length === 1
            ? "Your personal QR is ready in Duna for gate access."
            : `${passes.length} personal QR passes are ready in Duna for gate access.`
          : passes.length === 1
            ? "Your personal QR is ready in Duna. Add it to Apple Wallet for faster gate access."
            : `${passes.length} personal QR passes are ready in Duna. Add each one to Apple Wallet for faster gate access.`}
      </Text>
      {walletPasses.map((pass, index) => (
        <Pressable
          accessibilityHint="Opens the signed tournament admission pass in Apple Wallet"
          accessibilityLabel={walletButtonLabel(
            pass,
            index,
            walletPasses.length,
          )}
          disabled={busyId === pass.id}
          key={pass.id}
          onPress={() => void add(pass)}
          style={confirmationStyles.walletButton}
        >
          <Text style={confirmationStyles.walletButtonText}>
            {busyId === pass.id
              ? "Preparing pass…"
              : walletButtonLabel(pass, index, walletPasses.length)}
          </Text>
        </Pressable>
      ))}
      {walletPasses.length === 0 && (
        <Text style={confirmationStyles.fallback}>
          Your secure QR is saved under Plans → Tournament admission.
        </Text>
      )}
      {message ? (
        <Text style={confirmationStyles.message}>{message}</Text>
      ) : null}
    </View>
  );
}

const confirmationStyles = StyleSheet.create({
  body: {
    color: "#746d61",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  eyebrow: {
    color: "#78858a",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  fallback: {
    color: "#203740",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 14,
  },
  loading: { color: "#746d61", fontSize: 15 },
  message: {
    color: "#746d61",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  shell: {
    alignItems: "stretch",
    backgroundColor: "#ffffff",
    borderColor: "#d9ddd9",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
    width: "100%",
  },
  title: {
    color: "#111719",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 4,
  },
  walletButton: {
    alignItems: "center",
    backgroundColor: "#111719",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 56,
    paddingHorizontal: 18,
    width: "100%",
  },
  walletButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
});

function createStyles(palette: TournamentPassPalette) {
  return StyleSheet.create({
    shell: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      gap: 14,
      padding: 16,
    },
    flex: { flex: 1 },
    header: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
    headerMark: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 16,
      height: 44,
      justifyContent: "center",
      width: 44,
    },
    headerMarkText: {
      color: palette.playerAccent,
      fontSize: 24,
      fontWeight: "900",
    },
    eyebrow: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    title: {
      color: palette.text,
      fontSize: 22,
      fontWeight: "900",
      marginTop: 2,
    },
    body: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
    empty: {
      backgroundColor: palette.surfaceAlt,
      borderRadius: 15,
      padding: 13,
    },
    emptyTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
    list: { gap: 10 },
    pass: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 17,
      borderTopWidth: 4,
      borderWidth: 1,
      overflow: "hidden",
    },
    passTop: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: 76,
      padding: 12,
    },
    kindMark: {
      alignItems: "center",
      borderRadius: 12,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    kindMarkText: { color: palette.onButton, fontSize: 15, fontWeight: "900" },
    kind: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
    eventTitle: {
      color: palette.text,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 2,
    },
    meta: { color: palette.muted, fontSize: 10, marginTop: 3 },
    chevron: { color: palette.muted, fontSize: 24, fontWeight: "500" },
    passDetail: {
      alignItems: "center",
      borderTopColor: palette.border,
      borderTopWidth: 1,
      padding: 16,
    },
    qrShell: {
      backgroundColor: palette.qrBackground,
      borderRadius: 16,
      padding: 14,
    },
    holder: {
      color: palette.text,
      fontSize: 18,
      fontWeight: "900",
      marginTop: 13,
    },
    passLabel: { color: palette.muted, fontSize: 12, marginTop: 2 },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 12,
    },
    statusDot: { borderRadius: 4, height: 8, width: 8 },
    statusText: { color: palette.text, fontSize: 11, fontWeight: "800" },
    walletButton: {
      alignItems: "center",
      backgroundColor: palette.button,
      borderRadius: 13,
      justifyContent: "center",
      marginTop: 15,
      minHeight: 48,
      paddingHorizontal: 18,
      width: "100%",
    },
    walletButtonDisabled: { opacity: 0.45 },
    walletButtonText: {
      color: palette.onButton,
      fontSize: 13,
      fontWeight: "900",
    },
    security: {
      color: palette.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 11,
      textAlign: "center",
    },
    walletMessage: { color: palette.warning, fontSize: 11, lineHeight: 16 },
    walletFallback: {
      color: palette.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 12,
      textAlign: "center",
    },
  });
}
