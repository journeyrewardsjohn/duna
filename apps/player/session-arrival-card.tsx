import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import {
  startPlayerArrivalBackgroundUpdates,
  stopPlayerArrivalBackgroundUpdates,
} from "./arrival-location-task";
import {
  startDunaLiveActivity,
  type LiveActivityPushToken,
} from "./live-activities";
import type { DunaApiClient } from "./mobile-api";
import { FellixText as Text } from "./fellix-text";

type ArrivalSignal = Awaited<
  ReturnType<DunaApiClient["player"]["publishSessionArrival"]["mutate"]>
>;

export interface ArrivalBooking {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly venueName: string;
  readonly kind: string;
}

export interface ArrivalCardPalette {
  readonly accent: string;
  readonly accentSurface: string;
  readonly border: string;
  readonly muted: string;
  readonly surface: string;
  readonly text: string;
}

function sharingWindow(startsAt: string) {
  const start = Date.parse(startsAt);
  const now = Date.now();
  const opens = start - 60 * 60_000;
  const closes = start + 30 * 60_000;
  return {
    active: now >= opens && now < closes,
    opens,
    closes,
    tooEarly: now < opens,
  };
}

function minutes(value: number) {
  return Math.max(0, Math.ceil(value / 60));
}

function distanceLabel(value: number) {
  if (value < 160) return "At venue";
  const miles = value / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

function leaveLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function SessionArrivalCard({
  booking,
  client,
  compactPalette,
  onActivated,
}: {
  readonly booking: ArrivalBooking;
  readonly client?: DunaApiClient;
  readonly compactPalette?: ArrivalCardPalette;
  readonly onActivated?: () => void;
}) {
  const [signal, setSignal] = useState<ArrivalSignal>();
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string>();
  const watcher = useRef<Location.LocationSubscription | undefined>(undefined);
  const consentedAt = useRef<string | undefined>(undefined);
  const liveActivity = useRef<
    NonNullable<Awaited<ReturnType<typeof startDunaLiveActivity>>> | undefined
  >(undefined);
  const window = useMemo(
    () => sharingWindow(booking.startsAt),
    [booking.startsAt],
  );

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

  const activityProps = (next: ArrivalSignal) => ({
    subjectId: booking.id,
    kind: "upcoming" as const,
    title: booking.title,
    subtitle: booking.venueName,
    status:
      next.status === "running-late"
        ? "Running late"
        : next.status === "leave-now"
          ? "Leave now"
          : next.status === "arrived"
            ? "Arrived"
            : `Leave by ${leaveLabel(next.leaveBy)}`,
    startsAt: booking.startsAt,
    phase:
      next.status === "arrived"
        ? ("arrived" as const)
        : next.status === "leave-now" || next.status === "running-late"
          ? ("leave" as const)
          : ("prepare" as const),
    distanceMeters: next.distanceMeters,
    travelDurationSeconds: next.travelDurationSeconds,
    leaveBy: next.leaveBy,
    leaveByLabel: leaveLabel(next.leaveBy),
    startsAtLabel: leaveLabel(booking.startsAt),
    venueName: booking.venueName,
  });

  useEffect(() => {
    const checkPrivacyWindow = () => {
      const now = Date.now();
      if (now < window.opens || now >= window.closes) {
        stopLocalUpdates();
        endLocalActivity();
        if (client && signal) {
          void client.player.stopSessionArrival
            .mutate({ sessionId: signal.sessionId })
            .catch(() => undefined)
            .finally(() =>
              stopPlayerArrivalBackgroundUpdates(signal.sessionId).catch(
                () => undefined,
              ),
            );
        }
      }
    };
    checkPrivacyWindow();
    const timer = setInterval(checkPrivacyWindow, 60_000);
    return () => {
      clearInterval(timer);
      watcher.current?.remove();
      watcher.current = undefined;
    };
  }, [
    client,
    endLocalActivity,
    signal,
    stopLocalUpdates,
    window.closes,
    window.opens,
  ]);

  const publish = async (location: Location.LocationObject) => {
    if (
      !client ||
      !consentedAt.current ||
      !sharingWindow(booking.startsAt).active
    ) {
      stopLocalUpdates();
      endLocalActivity();
      return;
    }
    const next = await client.player.publishSessionArrival.mutate({
      registrationId: booking.id,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracyMeters:
        location.coords.accuracy === null
          ? undefined
          : Math.max(0, location.coords.accuracy),
      consentedAt: consentedAt.current,
    });
    setSignal(next);
    if (liveActivity.current) {
      await liveActivity.current
        .update({
          ...activityProps(next),
          updatedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    }
  };

  const rememberToken = async (token: LiveActivityPushToken) => {
    if (!client) return;
    await client.player.registerLiveActivity.mutate({
      kind: token.kind,
      subjectId: token.subjectId,
      activityId: token.activityId,
      pushToken: token.pushToken,
      environment: __DEV__ ? "sandbox" : "production",
    });
  };

  const begin = async () => {
    const currentWindow = sharingWindow(booking.startsAt);
    if (!currentWindow.active) {
      setMessage(
        currentWindow.tooEarly
          ? `Trip sharing opens at ${new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }).format(
              new Date(currentWindow.opens),
            )}. Duna will never start it early.`
          : "This session’s private arrival window has closed.",
      );
      return;
    }
    if (!client) {
      setMessage("Sign in to start your private trip assistant.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage(
          "Location stays off. You can still check in with your coach.",
        );
        return;
      }
      const consentTimestamp = new Date().toISOString();
      consentedAt.current = consentTimestamp;
      const first = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const initial = await client.player.publishSessionArrival.mutate({
        registrationId: booking.id,
        latitude: first.coords.latitude,
        longitude: first.coords.longitude,
        accuracyMeters:
          first.coords.accuracy === null
            ? undefined
            : Math.max(0, first.coords.accuracy),
        consentedAt: consentTimestamp,
      });
      setSignal(initial);
      setSharing(true);
      const backgroundPermission =
        await Location.requestBackgroundPermissionsAsync();
      const backgroundStarted = backgroundPermission.granted
        ? await startPlayerArrivalBackgroundUpdates({
            registrationId: booking.id,
            sessionId: initial.sessionId,
            startsAt: booking.startsAt,
            consentedAt: consentTimestamp,
          }).catch(() => false)
        : false;
      if (Platform.OS === "ios") {
        liveActivity.current =
          (await startDunaLiveActivity(activityProps(initial), {
            onPushToken: (token) => void rememberToken(token),
          })) ?? undefined;
        if (liveActivity.current) onActivated?.();
      }
      watcher.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 250,
          timeInterval: 60_000,
        },
        (nextLocation) => {
          void publish(nextLocation).catch(() => undefined);
        },
      );
      setMessage(
        backgroundStarted
          ? "Your Lock Screen ETA stays current. Only distance and ETA are shared—never raw location."
          : "ETA updates while Duna is open. Allow background location to keep the Lock Screen current.",
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Duna could not start the trip assistant.",
      );
      stopLocalUpdates();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    stopLocalUpdates();
    endLocalActivity();
    await stopPlayerArrivalBackgroundUpdates(signal?.sessionId).catch(
      () => undefined,
    );
    if (client && signal) {
      await client.player.stopSessionArrival
        .mutate({ sessionId: signal.sessionId })
        .catch(() => undefined);
    }
    setSignal(undefined);
    setMessage("Arrival sharing stopped.");
  };

  if (compactPalette && !signal) {
    const compactDetail = busy
      ? "Starting your private ETA…"
      : window.active
        ? "Tap to share your trip ETA"
        : "Available one hour before start";

    return (
      <View style={styles.compactWrap}>
        <Pressable
          accessibilityHint={
            window.active
              ? "Starts private arrival sharing"
              : "Shows the exact time arrival sharing becomes available"
          }
          accessibilityLabel={`Live Activities on. Trip Assistant. ${compactDetail}`}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={(event) => {
            event.stopPropagation();
            void begin();
          }}
          style={({ pressed }) => [
            styles.compactCard,
            {
              backgroundColor: compactPalette.surface,
              borderColor: compactPalette.border,
            },
            pressed && styles.compactCardPressed,
          ]}
        >
          <View
            style={[
              styles.compactMark,
              { backgroundColor: compactPalette.accentSurface },
            ]}
          >
            <Text
              style={[styles.compactMarkText, { color: compactPalette.accent }]}
            >
              ◉
            </Text>
          </View>
          <View style={styles.flex}>
            <Text
              style={[styles.compactEyebrow, { color: compactPalette.accent }]}
            >
              LIVE ACTIVITIES ON
            </Text>
            <Text style={[styles.compactTitle, { color: compactPalette.text }]}>
              Trip Assistant
            </Text>
            <Text
              style={[styles.compactDetail, { color: compactPalette.muted }]}
            >
              {compactDetail}
            </Text>
          </View>
          <Text
            style={[styles.compactAction, { color: compactPalette.accent }]}
          >
            {window.active ? "START" : "READY"}
          </Text>
        </Pressable>
        {message && (
          <Text
            style={[styles.compactMessage, { color: compactPalette.muted }]}
          >
            {message}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.liveMark}>
          <Text style={styles.liveMarkText}>◉</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DUNA TRIP ASSISTANT</Text>
          <Text style={styles.title}>
            {signal
              ? signal.status === "arrived"
                ? "You made it."
                : `${minutes(signal.travelDurationSeconds)} min to ${booking.venueName}`
              : "Arrive calm. Arrive on time."}
          </Text>
        </View>
        {sharing && <View style={styles.pulse} />}
      </View>

      {signal ? (
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>LEAVE BY</Text>
            <Text style={styles.metricValue}>{leaveLabel(signal.leaveBy)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>TRAVEL ETA</Text>
            <Text style={styles.metricValue}>
              {signal.status === "arrived"
                ? "HERE"
                : `${minutes(signal.travelDurationSeconds)} MIN`}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>DISTANCE</Text>
            <Text style={styles.metricSmall}>
              {distanceLabel(signal.distanceMeters)}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.body}>
          Duna turns location on only from 60 minutes before this session until
          30 minutes after it starts. Your coach sees a short-lived ETA—not a
          map of where you are.
        </Text>
      )}

      <Pressable
        disabled={busy}
        onPress={sharing ? () => void stop() : () => void begin()}
        style={[styles.button, sharing && styles.buttonStop]}
      >
        <Text style={[styles.buttonText, sharing && styles.buttonTextStop]}>
          {busy
            ? "Finding the best route…"
            : sharing
              ? "Stop sharing"
              : window.active
                ? "Share trip ETA"
                : "See when sharing opens"}
        </Text>
      </Pressable>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#141a1e",
    borderRadius: 22,
    marginTop: 14,
    overflow: "hidden",
    padding: 16,
  },
  topRow: { alignItems: "center", flexDirection: "row", gap: 11 },
  flex: { flex: 1 },
  liveMark: {
    alignItems: "center",
    backgroundColor: "rgba(134,201,239,.14)",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  liveMarkText: { color: "#b5ccd3", fontSize: 18, fontWeight: "900" },
  eyebrow: {
    color: "#b5ccd3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 3,
  },
  pulse: {
    backgroundColor: "#77d89b",
    borderRadius: 6,
    height: 9,
    width: 9,
  },
  body: { color: "#a9b4b8", fontSize: 11, lineHeight: 17, marginTop: 14 },
  metrics: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,.06)",
    borderRadius: 16,
    flexDirection: "row",
    marginTop: 14,
    padding: 12,
  },
  metric: { alignItems: "center", flex: 1 },
  metricLabel: { color: "#b5ccd3", fontSize: 10, fontWeight: "900" },
  metricValue: {
    color: "#ffffff",
    fontFamily: "Archivo-Table",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  metricSmall: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
  },
  divider: { backgroundColor: "rgba(255,255,255,.12)", height: 31, width: 1 },
  button: {
    alignItems: "center",
    backgroundColor: "#b5ccd3",
    borderRadius: 14,
    marginTop: 14,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonStop: { backgroundColor: "rgba(255,255,255,.1)" },
  buttonText: { color: "#141a1e", fontSize: 12, fontWeight: "900" },
  buttonTextStop: { color: "#ffffff" },
  message: {
    color: "#a9b4b8",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 9,
    textAlign: "center",
  },
  compactWrap: { marginTop: 12 },
  compactCard: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 72,
    padding: 12,
  },
  compactCardPressed: { opacity: 0.72 },
  compactMark: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  compactMarkText: { fontSize: 18, fontWeight: "800" },
  compactEyebrow: {
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 1.2,
  },
  compactTitle: { fontSize: 16, fontWeight: "600", marginTop: 2 },
  compactDetail: { fontSize: 14.5, lineHeight: 19, marginTop: 1 },
  compactAction: { fontSize: 11.5, fontWeight: "700", paddingHorizontal: 4 },
  compactMessage: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    textAlign: "center",
  },
});
