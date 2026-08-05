import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import {
  startCoachArrivalBackgroundUpdates,
  stopCoachArrivalBackgroundUpdates,
} from "./arrival-location-task";
import { startDunaProLiveActivity } from "./live-activities";
import type { DunaApiClient } from "./mobile-api";
import { useProRuntime } from "./runtime";
import { FellixText as Text } from "./fellix-text";

type ArrivalBoard = Awaited<
  ReturnType<DunaApiClient["operator"]["sessionArrivalBoard"]["query"]>
>;

function eta(value: number, status: string) {
  if (status === "arrived") return "HERE";
  return `${Math.max(1, Math.ceil(value / 60))} MIN`;
}

function distance(value: number) {
  if (value < 160) return "at venue";
  const miles = value / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

function signalColor(status: string) {
  if (status === "running-late") return "#c74e3f";
  if (status === "leave-now") return "#b47b20";
  if (status === "arrived") return "#2f7d57";
  return "#2f6fb1";
}

function exampleBoard(input: {
  readonly sessionId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venueName?: string;
  readonly expectedPlayers: number;
}): ArrivalBoard {
  const now = new Date();
  return {
    sessionId: input.sessionId,
    startsAt: input.startsAt,
    venueName: input.venueName,
    expectedPlayers: Math.max(input.expectedPlayers, 4),
    sharingWindow: {
      opensAt: new Date(Date.parse(input.startsAt) - 60 * 60_000).toISOString(),
      closesAt: new Date(
        Date.parse(input.startsAt) + 30 * 60_000,
      ).toISOString(),
      active: true,
      phase: "active",
    },
    signals: [
      ["Maya Chen", "arrived", 45, 0],
      ["Jordan Smith", "on-time", 2_840, 8 * 60],
      ["Theo Park", "leave-now", 5_920, 14 * 60],
      ["Avery Cole", "running-late", 9_160, 22 * 60],
    ].map(
      (
        [displayName, status, distanceMeters, travelDurationSeconds],
        index,
      ) => ({
        sessionId: input.sessionId,
        personId: `10000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
        displayName: String(displayName),
        role: "player" as const,
        status: status as "arrived" | "on-time" | "leave-now" | "running-late",
        distanceMeters: Number(distanceMeters),
        travelDurationSeconds: Number(travelDurationSeconds),
        leaveBy: new Date(
          Date.parse(input.startsAt) -
            Number(travelDurationSeconds) * 1_000 -
            5 * 60_000,
        ).toISOString(),
        routeSource: "google-routes" as const,
        accuracyMeters: 18,
        observedAt: now.toISOString(),
        expiresAt: new Date(
          Date.parse(input.startsAt) + 30 * 60_000,
        ).toISOString(),
      }),
    ),
  };
}

export function SessionArrivalBoard({
  sessionId,
  title,
  startsAt,
  venueName,
  expectedPlayers,
}: {
  readonly sessionId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venueName?: string;
  readonly expectedPlayers: number;
}) {
  const { client, mode } = useProRuntime();
  const preview = useMemo(
    () =>
      exampleBoard({ sessionId, title, startsAt, venueName, expectedPlayers }),
    [expectedPlayers, sessionId, startsAt, title, venueName],
  );
  const [board, setBoard] = useState<ArrivalBoard>(preview);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const watcher = useRef<Location.LocationSubscription | undefined>(undefined);
  const consentedAt = useRef<string | undefined>(undefined);
  const liveActivity = useRef<
    | NonNullable<Awaited<ReturnType<typeof startDunaProLiveActivity>>>
    | undefined
  >(undefined);

  const stopLocalUpdates = useCallback(() => {
    watcher.current?.remove();
    watcher.current = undefined;
    setSharing(false);
  }, []);

  const endLocalActivity = useCallback(() => {
    const current = liveActivity.current;
    liveActivity.current = undefined;
    if (current) void current.end("immediate").catch(() => undefined);
  }, []);

  const activityProps = useCallback(
    (next: ArrivalBoard) => {
      const players = next.signals
        .filter((signal) => signal.role === "player")
        .sort((left, right) => {
          const priority = (status: string) =>
            status === "running-late" ? 0 : status === "leave-now" ? 1 : 2;
          return priority(left.status) - priority(right.status);
        });
      const [first, second] = players;
      const arrived = players.filter(
        (player) => player.status === "arrived",
      ).length;
      const late = players.filter(
        (player) => player.status === "running-late",
      ).length;
      return {
        subjectId: sessionId,
        kind: "coach" as const,
        title,
        subtitle: venueName ?? "Venue location",
        status: late ? `${late} running late` : `${arrived} arrived`,
        startsAt,
        phase: "prepare" as const,
        venueName,
        rosterSummary: `${arrived} arrived · ${players.length}/${next.expectedPlayers} sharing${late ? ` · ${late} late` : ""}`,
        playerOneName: first?.displayName,
        playerOneEtaMinutes: first
          ? Math.ceil(first.travelDurationSeconds / 60)
          : undefined,
        playerOneStatus: first?.status,
        playerTwoName: second?.displayName,
        playerTwoEtaMinutes: second
          ? Math.ceil(second.travelDurationSeconds / 60)
          : undefined,
        playerTwoStatus: second?.status,
      };
    },
    [sessionId, startsAt, title, venueName],
  );

  const refresh = useCallback(async () => {
    if (!client || mode !== "live") return;
    const next = await client.operator.sessionArrivalBoard.query({ sessionId });
    setBoard(next);
    if (liveActivity.current) {
      await liveActivity.current
        .update({
          ...activityProps(next),
          updatedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    }
  }, [activityProps, client, mode, sessionId]);

  useEffect(() => {
    void refresh().catch(() => undefined);
    const timer = setInterval(
      () => void refresh().catch(() => undefined),
      30_000,
    );
    const privacyTimer = setInterval(() => {
      const now = Date.now();
      if (
        now < Date.parse(startsAt) - 60 * 60_000 ||
        now >= Date.parse(startsAt) + 30 * 60_000
      ) {
        stopLocalUpdates();
        endLocalActivity();
        if (client && mode === "live") {
          void client.operator.stopCoachSessionArrival
            .mutate({ sessionId })
            .catch(() => undefined)
            .finally(() =>
              stopCoachArrivalBackgroundUpdates(sessionId).catch(
                () => undefined,
              ),
            );
        }
      }
    }, 60_000);
    return () => {
      clearInterval(timer);
      clearInterval(privacyTimer);
      stopLocalUpdates();
    };
  }, [
    client,
    endLocalActivity,
    mode,
    refresh,
    sessionId,
    startsAt,
    stopLocalUpdates,
  ]);

  const publish = async (location: Location.LocationObject) => {
    const now = Date.now();
    const active =
      now >= Date.parse(startsAt) - 60 * 60_000 &&
      now < Date.parse(startsAt) + 30 * 60_000;
    if (!active) {
      stopLocalUpdates();
      endLocalActivity();
      void stopCoachArrivalBackgroundUpdates(sessionId).catch(() => undefined);
      return;
    }
    if (!client || !consentedAt.current) return;
    await client.operator.publishCoachSessionArrival.mutate({
      sessionId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracyMeters:
        location.coords.accuracy === null
          ? undefined
          : Math.max(0, location.coords.accuracy),
      consentedAt: consentedAt.current,
    });
    await refresh();
  };

  const start = async () => {
    const now = Date.now();
    const active =
      now >= Date.parse(startsAt) - 60 * 60_000 &&
      now < Date.parse(startsAt) + 30 * 60_000;
    if (!active) {
      setMessage(
        board.sharingWindow.phase === "early"
          ? "Live arrivals open 60 minutes before the session. Location stays off until then."
          : "This session’s arrival window has closed.",
      );
      return;
    }
    if (!client || mode !== "live") {
      setMessage(
        "Preview shows the full arrival board without sharing location.",
      );
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage("Location remains off. Player ETAs are still visible here.");
        return;
      }
      const consentTimestamp = new Date().toISOString();
      consentedAt.current = consentTimestamp;
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await publish(current);
      const next = await client.operator.sessionArrivalBoard.query({
        sessionId,
      });
      setBoard(next);
      const backgroundPermission =
        await Location.requestBackgroundPermissionsAsync();
      const backgroundStarted = backgroundPermission.granted
        ? await startCoachArrivalBackgroundUpdates({
            sessionId,
            startsAt,
            consentedAt: consentTimestamp,
          }).catch(() => false)
        : false;
      if (Platform.OS === "ios") {
        liveActivity.current =
          (await startDunaProLiveActivity(activityProps(next), (token) => {
            void client.operator.registerCoachLiveActivity
              .mutate({
                sessionId,
                activityId: token.activityId,
                pushToken: token.pushToken,
                environment: __DEV__ ? "sandbox" : "production",
              })
              .catch(() => undefined);
          })) ?? undefined;
      }
      watcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 300,
          timeInterval: 60_000,
        },
        (location) => void publish(location).catch(() => undefined),
      );
      setSharing(true);
      setMessage(
        backgroundStarted
          ? "Coach reminder stays current on the Lock Screen. Player ETAs never expose a map."
          : "Arrival reminder updates while Duna Pro is open. Allow background location to keep it current.",
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Duna Pro could not start live arrivals.",
      );
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    stopLocalUpdates();
    endLocalActivity();
    await stopCoachArrivalBackgroundUpdates(sessionId).catch(() => undefined);
    if (client) {
      await client.operator.stopCoachSessionArrival
        .mutate({ sessionId })
        .catch(() => undefined);
    }
    setMessage("Coach location sharing stopped. Player ETAs remain visible.");
  };

  const players = board.signals.filter((signal) => signal.role === "player");
  const arrived = players.filter(
    (signal) => signal.status === "arrived",
  ).length;
  const late = players.filter(
    (signal) => signal.status === "running-late",
  ).length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.mark}>
          <Text style={styles.markText}>◉</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>LIVE ARRIVALS · PRIVATE WINDOW</Text>
          <Text style={styles.title}>
            {late
              ? `${late} player${late === 1 ? " is" : "s are"} running late`
              : "Know who is on the way."}
          </Text>
          <Text style={styles.summary}>
            {arrived} arrived · {players.length}/{board.expectedPlayers} sharing
          </Text>
        </View>
        {sharing && <View style={styles.pulse} />}
      </View>

      <View style={styles.list}>
        {players.slice(0, 6).map((signal) => (
          <View key={signal.personId} style={styles.row}>
            <View
              style={[
                styles.status,
                { backgroundColor: signalColor(signal.status) },
              ]}
            />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {signal.displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{signal.displayName}</Text>
              <Text style={styles.meta}>
                {signal.status.replaceAll("-", " ")} ·{" "}
                {distance(signal.distanceMeters)}
              </Text>
            </View>
            <View style={styles.etaBlock}>
              <Text style={[styles.eta, { color: signalColor(signal.status) }]}>
                {eta(signal.travelDurationSeconds, signal.status)}
              </Text>
              <Text style={styles.etaLabel}>ETA</Text>
            </View>
          </View>
        ))}
        {players.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Waiting for player ETAs</Text>
            <Text style={styles.emptyBody}>
              Players opt in from their Duna session card. Raw coordinates are
              never shown or stored.
            </Text>
          </View>
        )}
      </View>

      <Pressable
        disabled={busy}
        onPress={sharing ? () => void stop() : () => void start()}
        style={[styles.button, sharing && styles.buttonStop]}
      >
        <Text style={[styles.buttonText, sharing && styles.buttonTextStop]}>
          {busy
            ? "Starting live arrivals…"
            : sharing
              ? "Stop coach sharing"
              : "Put arrivals on Lock Screen"}
        </Text>
      </Pressable>
      <Text style={styles.privacy}>
        Duna activates coach location only from 60 minutes before to 30 minutes
        after start. Player signals expire automatically.
      </Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#10263d",
    borderRadius: 22,
    marginTop: 16,
    overflow: "hidden",
    padding: 16,
  },
  header: { alignItems: "center", flexDirection: "row", gap: 11 },
  flex: { flex: 1 },
  mark: {
    alignItems: "center",
    backgroundColor: "rgba(134,201,239,.14)",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  markText: { color: "#86c9ef", fontSize: 18, fontWeight: "900" },
  eyebrow: {
    color: "#86c9ef",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: { color: "#ffffff", fontSize: 16, fontWeight: "900", marginTop: 3 },
  summary: { color: "#c8d6e2", fontSize: 10, marginTop: 3 },
  pulse: { backgroundColor: "#77d89b", borderRadius: 5, height: 9, width: 9 },
  list: {
    backgroundColor: "rgba(255,255,255,.05)",
    borderRadius: 16,
    marginTop: 14,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 62,
    paddingHorizontal: 11,
  },
  status: { borderRadius: 4, height: 8, width: 8 },
  avatar: {
    alignItems: "center",
    backgroundColor: "rgba(134,201,239,.13)",
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  avatarText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  name: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  meta: {
    color: "#c8d6e2",
    fontSize: 10,
    marginTop: 3,
    textTransform: "capitalize",
  },
  etaBlock: { alignItems: "flex-end" },
  eta: { fontSize: 12, fontWeight: "900" },
  etaLabel: { color: "#8da0b2", fontSize: 10, fontWeight: "900", marginTop: 2 },
  empty: { padding: 16 },
  emptyTitle: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  emptyBody: { color: "#c8d6e2", fontSize: 10, lineHeight: 14, marginTop: 4 },
  button: {
    alignItems: "center",
    backgroundColor: "#86c9ef",
    borderRadius: 14,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  buttonStop: { backgroundColor: "rgba(255,255,255,.1)" },
  buttonText: { color: "#10263d", fontSize: 11, fontWeight: "900" },
  buttonTextStop: { color: "#ffffff" },
  privacy: {
    color: "#8da0b2",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 9,
    textAlign: "center",
  },
  message: {
    color: "#c8d6e2",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 7,
    textAlign: "center",
  },
});
