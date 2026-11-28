/**
 * Live arrivals for a calendar session (rebuilt from the legacy
 * `session-arrival-board.tsx`, same calls and the same privacy window):
 * players who opted in show their ETA; the coach can put arrivals on the
 * Lock Screen (a Live Activity) and share their own location from 60 minutes
 * before to 30 minutes after the start. Raw coordinates are never shown.
 */
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Icon, Text, useTheme, type NativeColorRole } from "@duna/ui/native";
import {
  startCoachArrivalBackgroundUpdates,
  stopCoachArrivalBackgroundUpdates,
} from "../../../arrival-location-task";
import { startDunaProLiveActivity } from "../../../live-activities";
import type { DunaApiClient } from "../../../mobile-api";
import { useProRuntime } from "../../../runtime";
import { Card, SectionHead } from "../../app/ui";
import { ActionButton, PersonRow } from "./parts";

type ArrivalBoard = Awaited<
  ReturnType<DunaApiClient["operator"]["sessionArrivalBoard"]["query"]>
>;
type Signal = ArrivalBoard["signals"][number];

const OPENS_BEFORE_MS = 60 * 60_000;
const CLOSES_AFTER_MS = 30 * 60_000;

function etaText(signal: Signal): string {
  if (signal.status === "arrived") return "Here";
  return `${Math.max(1, Math.ceil(signal.travelDurationSeconds / 60))} min`;
}

function distanceText(meters: number): string {
  if (meters < 160) return "at the venue";
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

const STATUS_WORDS: Readonly<Record<Signal["status"], string>> = {
  arrived: "Arrived",
  "on-time": "On time",
  "leave-now": "Should leave now",
  "running-late": "Running late",
};

const STATUS_TONE: Readonly<Record<Signal["status"], NativeColorRole>> = {
  arrived: "positive",
  "on-time": "info",
  "leave-now": "warning",
  "running-late": "danger",
};

/** The preview build's example board (no location is read). */
function exampleBoard(input: {
  readonly sessionId: string;
  readonly startsAt: string;
  readonly venueName?: string;
  readonly expectedPlayers: number;
}): ArrivalBoard {
  const now = new Date();
  const start = Date.parse(input.startsAt);
  return {
    sessionId: input.sessionId,
    startsAt: input.startsAt,
    venueName: input.venueName,
    expectedPlayers: Math.max(input.expectedPlayers, 4),
    sharingWindow: {
      opensAt: new Date(start - OPENS_BEFORE_MS).toISOString(),
      closesAt: new Date(start + CLOSES_AFTER_MS).toISOString(),
      active: true,
      phase: "active",
    },
    signals: (
      [
        ["Maya Rivera", "arrived", 45, 0],
        ["Mara Lewis", "on-time", 2_840, 8 * 60],
        ["Alex Chen", "leave-now", 5_920, 14 * 60],
        ["Drew Park", "running-late", 9_160, 22 * 60],
      ] as const
    ).map(([displayName, status, distanceMeters, travel], index) => ({
      sessionId: input.sessionId,
      personId: `10000000-0000-4000-8000-${String(700 + index).padStart(12, "0")}`,
      displayName,
      role: "player" as const,
      status,
      distanceMeters,
      travelDurationSeconds: travel,
      leaveBy: new Date(start - travel * 1_000 - 5 * 60_000).toISOString(),
      routeSource: "google-routes" as const,
      accuracyMeters: 18,
      observedAt: now.toISOString(),
      expiresAt: new Date(start + CLOSES_AFTER_MS).toISOString(),
    })),
  };
}

export function ArrivalsCard({
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
  const { tokens } = useTheme();
  const live = mode === "live" && Boolean(client);
  const example = useMemo(
    () => exampleBoard({ sessionId, startsAt, venueName, expectedPlayers }),
    [expectedPlayers, sessionId, startsAt, venueName],
  );
  const [board, setBoard] = useState<ArrivalBoard | null>(
    live ? null : example,
  );
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const watcher = useRef<Location.LocationSubscription | undefined>(undefined);
  const consentedAt = useRef<string | undefined>(undefined);
  const activity = useRef<
    | NonNullable<Awaited<ReturnType<typeof startDunaProLiveActivity>>>
    | undefined
  >(undefined);
  const start = Date.parse(startsAt);
  const inWindow = useCallback(() => {
    const now = Date.now();
    return now >= start - OPENS_BEFORE_MS && now < start + CLOSES_AFTER_MS;
  }, [start]);

  const stopLocal = useCallback(() => {
    watcher.current?.remove();
    watcher.current = undefined;
    setSharing(false);
  }, []);
  const endActivity = useCallback(() => {
    const current = activity.current;
    activity.current = undefined;
    if (current) void current.end("immediate").catch(() => undefined);
  }, []);

  const activityProps = useCallback(
    (next: ArrivalBoard) => {
      const players = next.signals
        .filter((signal) => signal.role === "player")
        .sort((left, right) => {
          const rank = (status: string) =>
            status === "running-late" ? 0 : status === "leave-now" ? 1 : 2;
          return rank(left.status) - rank(right.status);
        });
      const [first, second] = players;
      const arrived = players.filter((p) => p.status === "arrived").length;
      const late = players.filter((p) => p.status === "running-late").length;
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
        playerOneAvatarUrl: first?.avatarUrl,
        playerOneEtaMinutes: first
          ? Math.ceil(first.travelDurationSeconds / 60)
          : undefined,
        playerOneStatus: first?.status,
        playerTwoName: second?.displayName,
        playerTwoAvatarUrl: second?.avatarUrl,
        playerTwoEtaMinutes: second
          ? Math.ceil(second.travelDurationSeconds / 60)
          : undefined,
        playerTwoStatus: second?.status,
      };
    },
    [sessionId, startsAt, title, venueName],
  );

  const refresh = useCallback(async () => {
    if (!live || !client) return;
    const next = await client.operator.sessionArrivalBoard.query({ sessionId });
    setBoard(next);
    if (activity.current) {
      await activity.current
        .update({ ...activityProps(next), updatedAt: new Date().toISOString() })
        .catch(() => undefined);
    }
  }, [activityProps, client, live, sessionId]);

  const stopRemote = useCallback(async () => {
    await stopCoachArrivalBackgroundUpdates(sessionId).catch(() => undefined);
    if (client && live) {
      await client.operator.stopCoachSessionArrival
        .mutate({ sessionId })
        .catch(() => undefined);
    }
  }, [client, live, sessionId]);

  useEffect(() => {
    void refresh().catch(() => undefined);
    const timer = setInterval(
      () => void refresh().catch(() => undefined),
      30_000,
    );
    // The privacy window closes on its own, even if nobody presses Stop.
    const privacy = setInterval(() => {
      if (inWindow()) return;
      stopLocal();
      endActivity();
      void stopRemote();
    }, 60_000);
    return () => {
      clearInterval(timer);
      clearInterval(privacy);
      stopLocal();
    };
  }, [endActivity, inWindow, refresh, stopLocal, stopRemote]);

  const publish = async (location: Location.LocationObject) => {
    if (!inWindow()) {
      stopLocal();
      endActivity();
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

  const startSharing = async () => {
    if (!inWindow()) {
      setMessage(
        Date.now() < start
          ? "Live arrivals open 60 minutes before the session. Location stays off until then."
          : "This session's arrival window has closed.",
      );
      return;
    }
    if (!live || !client) {
      setMessage("Preview shows the arrival board without sharing location.");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage("Location stays off. Player ETAs are still shown here.");
        return;
      }
      const consent = new Date().toISOString();
      consentedAt.current = consent;
      await publish(
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
      );
      const next = await client.operator.sessionArrivalBoard.query({
        sessionId,
      });
      setBoard(next);
      const background = await Location.requestBackgroundPermissionsAsync();
      const backgroundStarted = background.granted
        ? await startCoachArrivalBackgroundUpdates({
            sessionId,
            startsAt,
            consentedAt: consent,
          }).catch(() => false)
        : false;
      if (Platform.OS === "ios") {
        activity.current =
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
          ? "Arrivals stay current on the Lock Screen. Players never see a map."
          : "Arrivals update while Duna Pro is open. Allow background location to keep them current.",
      );
    } catch {
      setMessage("Duna Pro could not start live arrivals. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = async () => {
    stopLocal();
    endActivity();
    await stopRemote();
    setMessage("Your location sharing stopped. Player ETAs stay visible.");
  };

  const players =
    board?.signals.filter((signal) => signal.role === "player") ?? [];
  const arrived = players.filter(
    (signal) => signal.status === "arrived",
  ).length;
  const late = players.filter(
    (signal) => signal.status === "running-late",
  ).length;

  return (
    <View style={{ gap: tokens.space["2"] }} testID="session-arrivals">
      <SectionHead title="Arrivals" />
      <Card>
        <View accessible style={styles.head}>
          <Icon name="directions" size="nav" tone="text-2" />
          <View style={styles.flex}>
            <Text variant="phone-body" weight={600}>
              {late
                ? `${late} player${late === 1 ? " is" : "s are"} running late`
                : board
                  ? "Who is on the way"
                  : "Loading arrivals"}
            </Text>
            {board ? (
              <Text tone="text-2" variant="phone-meta">
                {`${arrived} arrived · ${players.length} of ${board.expectedPlayers} sharing`}
              </Text>
            ) : null}
          </View>
        </View>
        {players.slice(0, 6).map((signal) => (
          <PersonRow
            key={signal.personId}
            name={signal.displayName}
            note={`${STATUS_WORDS[signal.status]} · ${distanceText(signal.distanceMeters)}`}
            trailing={
              <Text
                tabular
                tone={STATUS_TONE[signal.status]}
                variant="phone-body"
                weight={600}
              >
                {etaText(signal)}
              </Text>
            }
          />
        ))}
        {board && players.length === 0 ? (
          <Text tone="text-2" variant="phone-meta">
            Players opt in from their Duna session card. Their ETAs appear here.
          </Text>
        ) : null}
        <ActionButton
          busy={busy}
          hint="Shares your location only from an hour before to 30 minutes after the start"
          icon={sharing ? "close" : "watch"}
          label={
            sharing
              ? "Stop sharing my location"
              : "Put arrivals on the Lock Screen"
          }
          onPress={() => void (sharing ? stopSharing() : startSharing())}
          testID="arrivals-toggle"
        />
        <Text tone="text-3" variant="phone-meta">
          Your location is only used from 60 minutes before to 30 minutes after
          the start. Player signals expire on their own.
        </Text>
        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            tone="text-2"
            variant="phone-meta"
          >
            {message}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 12, alignItems: "center" },
  flex: { flex: 1, gap: 2 },
});
