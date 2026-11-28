import {
  useProRuntime,
  type OperatorMatchScoringState,
} from "../../../runtime";
import { useWindowDimensions, View, Pressable } from "react-native";
import { useState, useRef, useMemo, useEffect } from "react";
import {
  type ScoringSystem,
  type ScoreEvent,
  foldScore,
  standardBeachFormat,
  createUndoEvent,
} from "@duna/league-engine";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { SatoshiText as Text } from "../../../satoshi-text";
import { initialEvents } from "./initial-events";
import { type PendingScoreEvent, type OperatorMatch } from "./scoring-types";
import {
  successHaptic,
  impactHaptic,
  selectionHaptic,
} from "../../shared/haptics";
import { loadDeviceId } from "./device-id";
import { displayError } from "../../shared/display-error";
import { MatchPicker } from "./MatchPicker";
import { styles } from "../../legacy/styles";
import { Pill } from "../../shared/Pill";
import { colors } from "../../shared/palette";

export function ScorerScreen({
  initialMatchId,
  onExit,
}: {
  readonly initialMatchId?: string;
  readonly onExit: () => void;
}) {
  const { client, matches = [], mode } = useProRuntime();
  const { width: scorerWidth } = useWindowDimensions();
  const expandedScorer = scorerWidth >= 700;
  const [previewSystem, setPreviewSystem] = useState<ScoringSystem>("rally");
  const [events, setEvents] = useState<readonly ScoreEvent[]>(initialEvents);
  const [pending, setPending] = useState<readonly PendingScoreEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [deviceId, setDeviceId] = useState<string>();
  const [selectedMatchId, setSelectedMatchId] = useState<string>();
  const [serverState, setServerState] = useState<OperatorMatchScoringState>();
  const [nextSequence, setNextSequence] = useState(2);
  const [nextCounter, setNextCounter] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const openedInitialMatch = useRef(false);
  const system = serverState?.format.scoringSystem ?? previewSystem;
  const state = useMemo(
    () =>
      foldScore(
        events,
        serverState?.format ?? {
          ...standardBeachFormat,
          scoringSystem: system,
        },
      ),
    [events, serverState?.format, system],
  );
  const current = state.sets[state.setIndex] ?? { a: 0, b: 0 };
  const scoreComplete =
    state.status === "complete" || state.status === "forfeit";
  const selectedMatch = matches.find((match) => match.id === selectedMatchId);
  const teamA = serverState?.teamA;
  const teamB = serverState?.teamB;

  useEffect(() => {
    if (scoreComplete) successHaptic();
  }, [scoreComplete]);

  useEffect(() => {
    if (mode === "preview") {
      setDeviceId("duna-pro-preview");
      return;
    }
    loadDeviceId()
      .then(setDeviceId)
      .catch((reason) => {
        setError(displayError(reason));
      });
  }, [mode]);

  useEffect(() => {
    const key =
      mode === "preview"
        ? "duna-pro-score-preview"
        : selectedMatchId
          ? `duna-pro-score-${selectedMatchId}`
          : undefined;
    if (!key) return;
    void AsyncStorage.setItem(
      key,
      JSON.stringify({ events, pending, nextSequence, nextCounter }),
    );
  }, [events, mode, nextCounter, nextSequence, pending, selectedMatchId]);

  function applyServerState(next: OperatorMatchScoringState) {
    setServerState(next);
    setEvents(next.events);
    setPending([]);
    setNextSequence(next.nextSequence);
    setNextCounter(next.nextMonotonicCounter);
  }

  async function hydrateOfflineQueue(next: OperatorMatchScoringState) {
    const saved = await AsyncStorage.getItem(`duna-pro-score-${next.matchId}`);
    if (!saved) {
      applyServerState(next);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as {
        readonly pending?: readonly PendingScoreEvent[];
      };
      const savedPending = parsed.pending ?? [];
      if (
        savedPending.length > 0 &&
        savedPending[0]?.sequence === next.nextSequence
      ) {
        setServerState(next);
        setPending(savedPending);
        setEvents([
          ...next.events,
          ...savedPending.map((envelope) => envelope.event),
        ]);
        setNextSequence(
          (savedPending.at(-1)?.sequence ?? next.nextSequence - 1) + 1,
        );
        setNextCounter(
          (savedPending.at(-1)?.monotonicCounter ??
            next.nextMonotonicCounter - 1) + 1,
        );
        setOffline(true);
        return;
      }
      if (savedPending.length > 0) {
        setError(
          "Saved offline score events no longer match the server sequence. They were preserved on this device for review.",
        );
      }
    } catch {
      setError("A saved offline score queue could not be read.");
    }
    applyServerState(next);
  }

  async function openMatch(match: OperatorMatch) {
    if (!client || !deviceId) return;
    setBusy(true);
    setError(undefined);
    try {
      const next =
        match.status === "scheduled"
          ? await client.operator.startMatchScoring.mutate({
              matchId: match.id,
              deviceId,
              initialServer: "A",
              confirmed: true,
              idempotencyKey: Crypto.randomUUID(),
            })
          : await client.operator.matchScoringState.query({
              matchId: match.id,
            });
      if (next.deviceId !== deviceId) {
        throw new Error(
          "This live match is controlled by another scoring device.",
        );
      }
      await hydrateOfflineQueue(next);
      setSelectedMatchId(match.id);
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (
      mode !== "live" ||
      !initialMatchId ||
      !deviceId ||
      openedInitialMatch.current
    ) {
      return;
    }
    const initialMatch = matches.find((match) => match.id === initialMatchId);
    if (!initialMatch) return;
    openedInitialMatch.current = true;
    void openMatch(initialMatch);
  }, [deviceId, initialMatchId, matches, mode]);

  async function submitEvent(event: ScoreEvent) {
    if (scoreComplete || busy) return;
    const envelope: PendingScoreEvent = {
      sequence: nextSequence,
      monotonicCounter: nextCounter,
      event,
    };
    setEvents((currentEvents) => [...currentEvents, event]);
    setNextSequence((value) => value + 1);
    setNextCounter((value) => value + 1);
    if (mode === "preview" || offline || !client || !serverState || !deviceId) {
      setPending((currentPending) => [...currentPending, envelope]);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.operator.appendMatchEvents.mutate({
        matchId: serverState.matchId,
        deviceId,
        events: [envelope],
        idempotencyKey: Crypto.randomUUID(),
      });
      applyServerState(result.scoring);
    } catch (reason) {
      setPending((currentPending) => [...currentPending, envelope]);
      setOffline(true);
      setError(
        `${displayError(reason)} The point remains encrypted on this device.`,
      );
    } finally {
      setBusy(false);
    }
  }

  function point(winner: "A" | "B") {
    impactHaptic();
    void submitEvent({
      id: Crypto.randomUUID(),
      type: "rally-won",
      winner,
      occurredAt: new Date().toISOString(),
    });
  }

  function undo() {
    selectionHaptic();
    const event = createUndoEvent(events, {
      id: Crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    });
    if (event) void submitEvent(event);
  }

  function reset() {
    if (mode !== "preview") return;
    setEvents([{ ...initialEvents[0]!, occurredAt: new Date().toISOString() }]);
    setPending([]);
    setNextSequence(2);
    setNextCounter(2);
  }

  async function synchronize() {
    if (
      mode === "preview" ||
      !client ||
      !serverState ||
      !deviceId ||
      pending.length === 0
    ) {
      setOffline((value) => !value);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.operator.appendMatchEvents.mutate({
        matchId: serverState.matchId,
        deviceId,
        events: [...pending],
        idempotencyKey: Crypto.randomUUID(),
      });
      applyServerState(result.scoring);
      setOffline(false);
    } catch (reason) {
      setOffline(true);
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "live" && !serverState) {
    return (
      <MatchPicker
        busy={busy}
        deviceId={deviceId}
        error={error}
        matches={matches}
        onExit={onExit}
        onOpen={(match) => void openMatch(match)}
      />
    );
  }

  return (
    <View style={styles.scorer}>
      <View style={styles.scorerTop}>
        <Pressable
          accessibilityLabel="Exit live scoring"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onExit}
          style={[
            styles.scorerExitButton,
            expandedScorer && styles.scorerExitButtonExpanded,
          ]}
        >
          <Text
            style={[
              styles.scorerExitIcon,
              expandedScorer && styles.scorerExitIconExpanded,
            ]}
          >
            ‹
          </Text>
          <View>
            <Text
              style={[
                styles.scorerExitText,
                expandedScorer && styles.scorerExitTextExpanded,
              ]}
            >
              Exit scoring
            </Text>
            <Text
              style={[
                styles.scorerExitMeta,
                expandedScorer && styles.scorerExitMetaExpanded,
              ]}
            >
              Progress is saved
            </Text>
          </View>
        </Pressable>
        <View style={styles.scorerIdentity}>
          <Text
            numberOfLines={1}
            style={[
              styles.scorerMatch,
              expandedScorer && styles.scorerMatchExpanded,
            ]}
          >
            {selectedMatch
              ? `${selectedMatch.teamA.name} · ${selectedMatch.teamB.name}`
              : "PREVIEW MATCH · EXHIBITION"}
          </Text>
          <Text
            style={[
              styles.scorerVenue,
              expandedScorer && styles.scorerVenueExpanded,
            ]}
          >
            {serverState?.venueName ?? "Manhattan Beach · Court 4"}
          </Text>
        </View>
        <View style={styles.scorerStatusGroup}>
          <Pill tone={scoreComplete ? "positive" : "live"}>
            {scoreComplete
              ? "Complete"
              : mode === "preview"
                ? "Preview"
                : "Live"}
          </Pill>
          <Pressable
            disabled={busy}
            onPress={() => void synchronize()}
            style={styles.syncButton}
          >
            <Text
              style={[styles.syncIcon, offline && { color: colors.warning }]}
            >
              {offline ? "◌" : "●"}
            </Text>
            <Text style={styles.syncText}>
              {offline
                ? `${pending.length} saved`
                : busy
                  ? "Syncing"
                  : "Synced"}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.scorerFormat}>
        {mode === "preview" && (
          <View style={styles.segmented}>
            <Pressable
              onPress={() => setPreviewSystem("rally")}
              style={[
                styles.segmentButton,
                expandedScorer && styles.segmentButtonExpanded,
                system === "rally" && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  expandedScorer && styles.segmentTextExpanded,
                  system === "rally" && styles.segmentTextActive,
                ]}
              >
                Rally
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPreviewSystem("sideout")}
              style={[
                styles.segmentButton,
                expandedScorer && styles.segmentButtonExpanded,
                system === "sideout" && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  expandedScorer && styles.segmentTextExpanded,
                  system === "sideout" && styles.segmentTextActive,
                ]}
              >
                Sideout
              </Text>
            </Pressable>
          </View>
        )}
        <Text
          style={[
            styles.scorerFormatText,
            expandedScorer && styles.scorerFormatTextExpanded,
          ]}
        >
          Set {state.setIndex + 1} · best of 3 · to{" "}
          {standardBeachFormat.pointTargets[state.setIndex] ?? 21}
        </Text>
      </View>
      {(state.sideSwitchDue || state.technicalTimeoutDue) && (
        <View style={styles.scoreNotice}>
          <Text style={styles.scoreNoticeIcon}>⇄</Text>
          <Text style={styles.scoreNoticeTitle}>
            {state.technicalTimeoutDue ? "Technical timeout" : "Switch sides"}
          </Text>
          <Text style={styles.scoreNoticeBody}>
            Confirm when both teams are ready.
          </Text>
        </View>
      )}
      <View style={styles.court}>
        <Pressable
          disabled={scoreComplete || busy}
          onPress={() => point("A")}
          style={[styles.teamButton, styles.teamA]}
        >
          <View style={styles.serveRow}>
            <View
              style={[styles.serveDot, state.serving !== "A" && { opacity: 0 }]}
            />
            <Text
              style={[
                styles.serveText,
                expandedScorer && styles.serveTextExpanded,
              ]}
            >
              {state.serving === "A" ? "SERVING" : "RECEIVING"}
            </Text>
          </View>
          <View style={styles.teamPeople}>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamA?.people[0]?.initials ?? "ML"}
              </Text>
            </View>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamA?.people[1]?.initials ?? "TP"}
              </Text>
            </View>
            <Text
              style={[
                styles.teamName,
                expandedScorer && styles.teamNameExpanded,
              ]}
            >
              {teamA?.name ?? "Mara / Theo"}
            </Text>
          </View>
          <Text
            style={[styles.bigScore, expandedScorer && styles.bigScoreExpanded]}
          >
            {current.a}
          </Text>
          <Text
            style={[styles.tapHint, expandedScorer && styles.tapHintExpanded]}
          >
            TAP ANYWHERE FOR POINT
          </Text>
        </Pressable>
        <View style={styles.versus}>
          <Text style={styles.versusText}>VS</Text>
        </View>
        <Pressable
          disabled={scoreComplete || busy}
          onPress={() => point("B")}
          style={[styles.teamButton, styles.teamB]}
        >
          <View style={styles.serveRow}>
            <View
              style={[styles.serveDot, state.serving !== "B" && { opacity: 0 }]}
            />
            <Text
              style={[
                styles.serveText,
                expandedScorer && styles.serveTextExpanded,
              ]}
            >
              {state.serving === "B" ? "SERVING" : "RECEIVING"}
            </Text>
          </View>
          <View style={styles.teamPeople}>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamB?.people[0]?.initials ?? "NW"}
              </Text>
            </View>
            <View
              style={[
                styles.scoreAvatar,
                expandedScorer && styles.scoreAvatarExpanded,
              ]}
            >
              <Text
                style={[
                  styles.scoreAvatarText,
                  expandedScorer && styles.scoreAvatarTextExpanded,
                ]}
              >
                {teamB?.people[1]?.initials ?? "ET"}
              </Text>
            </View>
            <Text
              style={[
                styles.teamName,
                expandedScorer && styles.teamNameExpanded,
              ]}
            >
              {teamB?.name ?? "Noa / Elena"}
            </Text>
          </View>
          <Text
            style={[styles.bigScore, expandedScorer && styles.bigScoreExpanded]}
          >
            {current.b}
          </Text>
          <Text
            style={[styles.tapHint, expandedScorer && styles.tapHintExpanded]}
          >
            TAP ANYWHERE FOR POINT
          </Text>
        </Pressable>
      </View>
      <View style={styles.scorerBottom}>
        <Pressable
          disabled={events.length <= 1 || busy}
          onPress={undo}
          style={styles.secondaryAction}
        >
          <Text style={styles.secondaryActionText}>↶ Undo</Text>
        </Pressable>
        <View style={styles.syncSummary}>
          <Text
            style={[
              styles.syncIcon,
              { color: offline ? colors.warning : colors.positive },
            ]}
          >
            {offline ? "◌" : "●"}
          </Text>
          <Text style={styles.syncSummaryText}>
            {mode === "preview"
              ? "Preview only"
              : offline
                ? `${pending.length} waiting`
                : "Score saved"}
          </Text>
        </View>
        <View style={styles.sets}>
          {state.sets.map((set, index) => (
            <View
              key={index}
              style={[
                styles.setBox,
                index === state.setIndex && styles.setBoxActive,
              ]}
            >
              <Text style={styles.setLabel}>S{index + 1}</Text>
              <Text style={styles.setScore}>
                {set.a}–{set.b}
              </Text>
            </View>
          ))}
        </View>
        <Pressable onLongPress={reset} style={styles.moreScore}>
          <Text style={styles.moreScoreText}>•••</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.scorerError}>{error}</Text>}
    </View>
  );
}
