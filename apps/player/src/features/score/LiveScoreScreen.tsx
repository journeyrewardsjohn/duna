/**
 * The scorekeeper (M-P4a, boards P-Live, DUO-Half-Score, DUO-Half-Live).
 * The live zone, and the only place Solar appears: the Live crest.
 *
 * - iPhone portrait: the score and its calls on top, the two point buttons
 *   under the thumbs, Undo always one tap below them.
 * - iPhone landscape: a button each side of the score.
 * - iPhone Duo propped half-open: the score on the top pane (read from the
 *   court), the buttons on the bottom pane (FoldScaffold); nothing scrolls
 *   across the fold.
 * - Duo open and iPad: the scoreboard and buttons beside the point-by-point
 *   log and the line-up; on a full iPad the numbers are sized to be read
 *   from across a court.
 *
 * Every point is stored on the phone before anything else (see
 * `use-live-match.ts`); the screen stays on while scoring; VoiceOver hears
 * each point; each button says its side and the score it makes.
 */
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { formatSetScore } from "@duna/tideline-core";
import {
  AdaptiveSheet,
  FoldScaffold,
  Icon,
  LiveCrest,
  LiveZone,
  LoadingState,
  Numerals,
  Text,
  Title,
  useHaptics,
  useScoreChange,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RouteEntryContext, useShell } from "../../app/ShellContext";
import { usePlayerRuntime } from "../../../runtime";
import { previewLiveMatch } from "./preview-fixtures";
import { ActionButton } from "../find/parts";
import { LineupEditor } from "./Lineup";
import { useLiveMatchController } from "./LiveMatchContext";
import { NetScoreCard } from "./NetScoreCard";
import { CheckRow, Notice } from "./parts";
import { AGREEMENT_LABEL } from "./result-rules";
import {
  missingPlaces,
  type LiveMatch,
  type LiveView,
  type TeamSide,
} from "./scoring-machine";
import { StartMatch, useMe } from "./StartMatch";
import { draftFromLive } from "./score-draft";
import { liveCall, pointButtonLabel, sideKey, syncText } from "./live-copy";
import type { SyncStatus } from "./use-live-match";

function useNumberSize(base: number): number {
  const { width, height } = useWindowDimensions();
  // Sized to the window so the score reads from the bench; never tiny.
  return Math.max(base, Math.min(width * 0.22, height * 0.26, 320));
}

function PointButton({
  view,
  side,
  onPress,
  numberSize,
  disabled,
  compact,
  pointOnly,
}: {
  readonly view: LiveView;
  readonly side: TeamSide;
  readonly onPress: () => void;
  readonly numberSize: number;
  readonly disabled: boolean;
  readonly compact?: boolean;
  /** Propped half-open: the score is on the top pane. */
  readonly pointOnly?: boolean;
}) {
  const { colors, tokens } = useTheme();
  const serving = view.serving === side && !view.decided;
  const name = view.names[sideKey(side)];
  const call = view.matchPoint.includes(side)
    ? "Match point"
    : view.setPoint.includes(side)
      ? "Set point"
      : null;
  return (
    <Pressable
      accessibilityHint={serving ? `${name} serving` : undefined}
      accessibilityLabel={pointButtonLabel(view, side)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pointButton,
        {
          backgroundColor: pressed ? colors["surface-raised"] : colors.surface,
          borderColor: serving ? colors.sun : colors.line,
          borderWidth: serving ? 2 : StyleSheet.hairlineWidth,
          borderRadius: tokens.radius["2xl"],
          padding: compact ? tokens.space["2"] : tokens.space["3"],
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      testID={`point-${side}`}
    >
      <View style={styles.pointHead}>
        {serving ? <Icon name="serve" size="inline" tone="text" /> : null}
        <Text
          numberOfLines={2}
          style={styles.centerText}
          variant="phone-body"
          weight={600}
        >
          {name}
        </Text>
      </View>
      {pointOnly ? (
        // Propped half-open the score is on the top pane: the button is
        // just the point (board DUO-Half-Score).
        <Text variant="heading-32" weight={600}>
          Point
        </Text>
      ) : (
        <Numerals
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={{ fontSize: numberSize, lineHeight: numberSize * 1.04 }}
          weight={600}
        >
          {view.points[side]}
        </Numerals>
      )}
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {call ?? (disabled || pointOnly ? " " : "Tap for a point")}
      </Text>
    </Pressable>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  readonly icon: GlyphName;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: pressed ? colors["surface-raised"] : colors.surface,
          borderColor: colors.line,
          borderRadius: tokens.radius.lg,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
      testID={testID}
    >
      <Icon name={icon} size="control" />
      <Text numberOfLines={1} variant="phone-body" weight={600}>
        {label}
      </Text>
    </Pressable>
  );
}

function Header({
  view,
  match,
  sync,
  queued,
  onClose,
}: {
  readonly view: LiveView;
  readonly match: LiveMatch;
  readonly sync: SyncStatus;
  readonly queued: number;
  readonly onClose: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.header, { gap: tokens.space["2"] }]}>
      <Pressable
        accessibilityLabel="Close the scoreboard"
        accessibilityHint="The match keeps its score on this phone"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClose}
        style={styles.close}
      >
        <Icon name="close" size="nav" />
      </Pressable>
      <View style={styles.headerText}>
        <Text accessibilityRole="header" variant="phone-heading">
          {view.decided
            ? "Match over"
            : `Set ${view.setNumber} · to ${view.target}`}
        </Text>
        <Text numberOfLines={1} tone="text-2" variant="phone-meta">
          {[match.venue?.label, syncText(sync, queued)]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {view.decided ? null : <LiveCrest label="Live" />}
    </View>
  );
}

function Calls({
  view,
  onResume,
}: {
  readonly view: LiveView;
  readonly onResume: () => void;
}) {
  const call = liveCall(view);
  const { tokens } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.calls, { gap: tokens.space["2"] }]}
    >
      {call ? (
        <View style={styles.callRow}>
          <Icon
            name={
              view.sideSwitchDue
                ? "side-switch"
                : view.technicalTimeoutDue
                  ? "timeout"
                  : view.matchPoint.length
                    ? "match-point"
                    : "set"
            }
            size="control"
          />
          <Text variant="phone-heading">{call}</Text>
        </View>
      ) : null}
      {view.technicalTimeoutDue ? (
        <ActionButton
          kind="secondary"
          label="Resume play"
          onPress={onResume}
          testID="resume-play"
        />
      ) : null}
      {!view.decided && view.nextSwitchAt ? (
        <Text tone="text-2" variant="phone-meta">
          {`Next side switch at ${view.nextSwitchAt} points · ${view.names[sideKey(view.serving)]} serving`}
        </Text>
      ) : null}
    </View>
  );
}

function PointLog({ view }: { readonly view: LiveView }) {
  const { tokens, colors } = useTheme();
  return (
    <View style={{ gap: tokens.space["2"] }}>
      <Text accessibilityRole="header" variant="phone-heading">
        Point by point
      </Text>
      {view.log.length === 0 ? (
        <Text tone="text-2" variant="phone-meta">
          Points appear here as they are scored.
        </Text>
      ) : (
        view.log.map((entry) => (
          <View
            accessible
            key={entry.id}
            style={[styles.logRow, { borderBottomColor: colors.line }]}
          >
            <Numerals style={styles.logScore} variant="phone-body">
              {formatSetScore(entry.a, entry.b)}
            </Numerals>
            <Text style={styles.fill} variant="phone-body">
              {`Point ${view.names[sideKey(entry.winner)]}`}
            </Text>
            <Text tone="text-2" variant="phone-meta">
              {`Set ${entry.setNumber}`}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function Finish({
  match,
  view,
  sync,
  queued,
}: {
  readonly match: LiveMatch;
  readonly view: LiveView;
  readonly sync: SyncStatus;
  readonly queued: number;
}) {
  const live = useLiveMatchController();
  const shell = useShell();
  const me = useMe();
  const { tokens } = useTheme();
  const missing = missingPlaces(match);
  const matchId = live.record?.queue.matchId;
  const allSent = sync.kind === "synced" && queued === 0;
  return (
    <View style={{ gap: tokens.space["3"] }}>
      {view.decided ? null : (
        <Notice tone="info" title="Stopped before the end">
          {matchId
            ? "The score so far is kept. A match stopped early stays open on Duna until it is finished."
            : "The score so far is kept on this phone. Add it as a result to save the sets you played."}
        </Notice>
      )}
      {missing > 0 || !match.agreed ? (
        <View style={{ gap: tokens.space["3"] }}>
          <Text variant="phone-heading">
            {missing > 0
              ? `Add ${missing === 1 ? "one more player" : `${missing} more players`} to save it`
              : "One last thing"}
          </Text>
          <LineupEditor
            me={me}
            onChange={(teams) =>
              live.update((current) => ({ ...current, teams }))
            }
            teamSize={match.teamSize}
            teams={match.teams}
          />
          <CheckRow
            checked={match.agreed}
            label={AGREEMENT_LABEL}
            onChange={(agreed) =>
              live.update((current) => ({ ...current, agreed }))
            }
          />
        </View>
      ) : null}
      {sync.kind === "local" ? (
        <Notice tone="info" title="Kept on this phone">
          Sign in to save scored matches to Duna and move your Sand Rating.
        </Notice>
      ) : null}
      {sync.kind === "offline" ? (
        <Notice tone="warning" title="Waiting for a connection">
          {`${sync.queued} ${sync.queued === 1 ? "point is" : "points are"} saved on this phone and send as soon as you're online.`}
        </Notice>
      ) : null}
      {sync.kind === "other-device" ? (
        <Notice tone="warning" title="Scored on another phone">
          Another phone is the scorer of record for this match. Points from this
          phone are kept here only.
        </Notice>
      ) : null}
      {sync.kind === "error" ? (
        <Notice tone="danger" title="Not saved yet">
          {`${sync.message} Reference ${sync.reference}.`}
        </Notice>
      ) : null}
      {matchId && allSent && view.decided ? (
        <ActionButton
          label="See the result"
          onPress={() => {
            shell.open("result", { targetId: matchId });
            live.discard();
          }}
          testID="see-result"
        />
      ) : null}
      {!view.decided && !matchId ? (
        <ActionButton
          kind="secondary"
          label="Add it as a result"
          onPress={() => {
            shell.addResult(draftFromLive(match));
            live.discard();
          }}
        />
      ) : null}
      {sync.kind === "error" || sync.kind === "offline" ? (
        <ActionButton kind="secondary" label="Try again" onPress={live.retry} />
      ) : null}
      <ActionButton
        kind="quiet"
        label="Discard this match"
        onPress={() =>
          Alert.alert(
            "Discard this match?",
            matchId
              ? "It is removed from this phone. What already reached Duna stays there."
              : "The score is removed from this phone and can’t be brought back.",
            [
              { text: "Keep it", style: "cancel" },
              {
                text: "Discard",
                style: "destructive",
                onPress: live.discard,
              },
            ],
          )
        }
      />
    </View>
  );
}

function Scoreboard({ arrangement }: { readonly arrangement: string }) {
  const live = useLiveMatchController();
  const shell = useShell();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const region = useRegionLayout();
  const record = live.record!;
  const view = live.view!;
  const match = record.match;
  useScoreChange(view.net, { names: view.names });
  const [tabletop, setTabletop] = useState(false);

  const layout = region.layout;
  const landscape = layout.heightClass === "compact";
  const wide = layout.paneCount >= 2 && layout.mode !== "tabletop";
  const expanded = layout.widthClass === "expanded";
  const numberSize = useNumberSize(expanded ? 160 : 88);
  const ended = Boolean(match.endedAt) || view.decided;
  const close = () => shell.dispatch({ type: "close-window" });

  const point = (side: TeamSide) => live.point(side);
  const undo = () => {
    haptics.confirmed(1);
    live.undo();
  };
  const timeout = () =>
    Alert.alert("Timeout", "Which side called it?", [
      ...(["A", "B"] as const).map((side) => ({
        text: `${view.names[sideKey(side)]} (${view.timeoutsLeft[side]} left)`,
        onPress: () => {
          if (view.timeoutsLeft[side] === 0) return;
          haptics.confirmed(0);
          live.timeout(side);
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  const end = () =>
    Alert.alert(
      "End the match now?",
      "The score so far is kept. You can save it next.",
      [
        { text: "Keep scoring", style: "cancel" },
        { text: "End match", style: "destructive", onPress: live.end },
      ],
    );

  const header = (
    <Header
      match={match}
      onClose={close}
      queued={live.queued}
      sync={live.sync}
      view={view}
    />
  );
  const card = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          borderRadius: tokens.radius.xl,
          padding: tokens.space["4"],
        },
      ]}
    >
      <NetScoreCard names={view.names} state={view.net} />
    </View>
  );
  const buttons = (pointOnly?: boolean) => (
    <View style={[styles.buttons, { gap: tokens.space["3"] }]}>
      <PointButton
        compact={pointOnly}
        disabled={ended}
        numberSize={numberSize}
        onPress={() => point("A")}
        pointOnly={pointOnly}
        side="A"
        view={view}
      />
      <PointButton
        compact={pointOnly}
        disabled={ended}
        numberSize={numberSize}
        onPress={() => point("B")}
        pointOnly={pointOnly}
        side="B"
        view={view}
      />
    </View>
  );
  const controls = (
    <View style={[styles.controls, { gap: tokens.space["2"] }]}>
      <ControlButton
        disabled={!view.canUndo}
        icon="undo"
        label="Undo"
        onPress={undo}
        testID="undo"
      />
      <ControlButton
        disabled={
          ended || (view.timeoutsLeft.A === 0 && view.timeoutsLeft.B === 0)
        }
        icon="timeout"
        label="Timeout"
        onPress={timeout}
      />
      {ended ? null : (
        <ControlButton icon="close" label="End" onPress={end} testID="end" />
      )}
    </View>
  );
  const finish = ended ? (
    <Finish match={match} queued={live.queued} sync={live.sync} view={view} />
  ) : null;
  const pad = {
    paddingTop: insets.top + tokens.space["2"],
    paddingBottom: insets.bottom + tokens.space["3"],
    paddingLeft: insets.left + tokens.space["4"],
    paddingRight: insets.right + tokens.space["4"],
  };
  const calls = <Calls onResume={live.resumePlay} view={view} />;

  if (layout.mode === "tabletop" || tabletop) {
    return (
      <FoldScaffold
        onTabletopChange={setTabletop}
        primary={
          <View style={[styles.fill, pad, { gap: tokens.space["3"] }]}>
            {header}
            <View style={styles.board}>
              {(["A", "B"] as const).map((side) => (
                <View key={side} style={styles.boardSide}>
                  <Text style={styles.centerText} variant="phone-heading">
                    {view.names[sideKey(side)]}
                  </Text>
                  <Numerals
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1}
                    numberOfLines={1}
                    style={{
                      fontSize: numberSize * 1.3,
                      lineHeight: numberSize * 1.34,
                    }}
                    weight={600}
                  >
                    {view.points[side]}
                  </Numerals>
                </View>
              ))}
            </View>
            {calls}
          </View>
        }
        secondary={
          <View
            style={[
              styles.fill,
              {
                padding: tokens.space["4"],
                // Room for the half-open view's Done under the controls.
                paddingBottom: tokens.space["4"] + 52,
                gap: tokens.space["3"],
              },
            ]}
          >
            {finish ?? (
              <>
                <View style={styles.fill}>{buttons(true)}</View>
                {controls}
              </>
            )}
          </View>
        }
      />
    );
  }

  const side = (
    <ScrollView contentContainerStyle={[pad, { gap: tokens.space["5"] }]}>
      <PointLog view={view} />
      <View style={{ gap: tokens.space["2"] }}>
        <Text accessibilityRole="header" variant="phone-heading">
          Line-up
        </Text>
        {(["A", "B"] as const).map((team) => (
          <Text key={team} tone="text-2" variant="phone-body">
            {`${view.names[sideKey(team)]}: ${
              match.teams[team].people
                .map((person) => person.name)
                .join(", ") || "not named yet"
            }`}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
  const main = (
    <ScrollView
      contentContainerStyle={[pad, { gap: tokens.space["4"], flexGrow: 1 }]}
      testID={`scoreboard-${arrangement}`}
    >
      {header}
      {card}
      {calls}
      {finish ?? (
        <>
          <View style={[styles.fill, { minHeight: numberSize * 1.8 }]}>
            {buttons()}
          </View>
          {controls}
        </>
      )}
    </ScrollView>
  );

  // A full iPad: the scoreboard owns the window, read from across a court;
  // the log and line-up sit beside it.
  if (expanded) {
    return (
      <View style={[styles.fill, styles.row]}>
        <View style={{ flex: 2 }}>{main}</View>
        <View
          style={[
            styles.fill,
            {
              borderLeftWidth: StyleSheet.hairlineWidth,
              borderLeftColor: colors.line,
            },
          ]}
        >
          {side}
        </View>
      </View>
    );
  }

  // The open Duo and an iPad at half width: two panes split at the fold.
  if (wide) {
    return <FoldScaffold primary={main} secondary={side} tabletop="off" />;
  }

  if (landscape && !ended) {
    return (
      <View style={[styles.fill, pad, styles.row, { gap: tokens.space["3"] }]}>
        <View style={styles.fill}>
          <PointButton
            compact
            disabled={ended}
            numberSize={numberSize}
            onPress={() => point("A")}
            side="A"
            view={view}
          />
        </View>
        <View style={[styles.middle, { gap: tokens.space["2"] }]}>
          {header}
          {card}
          {calls}
          {controls}
        </View>
        <View style={styles.fill}>
          <PointButton
            compact
            disabled={ended}
            numberSize={numberSize}
            onPress={() => point("B")}
            side="B"
            view={view}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, pad]} testID="scoreboard-phone">
      {header}
      {ended ? (
        <ScrollView
          contentContainerStyle={{
            gap: tokens.space["4"],
            paddingVertical: tokens.space["3"],
          }}
        >
          {card}
          {calls}
          {finish}
          {controls}
        </ScrollView>
      ) : (
        <View style={[styles.fill, { gap: tokens.space["3"] }]}>
          <View
            style={{ gap: tokens.space["2"], paddingTop: tokens.space["2"] }}
          >
            {card}
            {calls}
          </View>
          <View style={styles.fill}>{buttons()}</View>
          {controls}
        </View>
      )}
    </View>
  );
}

/** The live window: Start a match, or the scoreboard for the match on this phone. */
export function LiveScoreScreen() {
  const live = useLiveMatchController();
  const shell = useShell();
  const runtime = usePlayerRuntime();
  const entry = useContext(RouteEntryContext);
  const { colors } = useTheme();
  const seed =
    runtime.mode === "preview" &&
    (entry?.prompt === "demo" ||
      entry?.prompt === "finish" ||
      entry?.prompt === "clear")
      ? entry.prompt
      : null;
  useEffect(() => {
    if (!seed || !live.ready) return;
    if (seed === "clear") {
      live.discard();
      shell.dispatch({ type: "close-window" });
      return;
    }
    live.start(previewLiveMatch(seed));
    // Seed once per open link.
  }, [seed, live.ready, entry?.nonce]);
  if (!live.ready) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.ground }]}>
        <LoadingState loading label="Opening the scoreboard" />
      </View>
    );
  }
  if (!live.record || !live.view) {
    return (
      <StartMatch
        onClose={() => shell.dispatch({ type: "close-window" })}
        onStart={live.start}
      />
    );
  }
  return (
    <LiveZone>
      <LiveGround>
        <Scoreboard arrangement="split" />
      </LiveGround>
    </LiveZone>
  );
}

function LiveGround({ children }: { readonly children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: colors.ground }]}>
      {children}
    </View>
  );
}

/**
 * At launch, a match left mid-set: resume it or end it (board P-Live). The
 * score is already safe on the phone either way.
 */
export function LiveResumeCard({
  onResume,
}: {
  readonly onResume: () => void;
}) {
  const live = useLiveMatchController();
  const { tokens } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  // Only a match found on the phone at launch (left mid-set), never one
  // the person just closed.
  const [restoredId, setRestoredId] = useState<string | null | undefined>();
  useEffect(() => {
    if (live.ready && restoredId === undefined)
      setRestoredId(live.record?.match.id ?? null);
  }, [live.ready, live.record, restoredId]);
  const record = live.record;
  const view = live.view;
  const visible = Boolean(
    !dismissed &&
    record &&
    view &&
    record.match.id === restoredId &&
    !record.match.endedAt &&
    !view.decided &&
    record.match.events.length > 1,
  );
  return (
    <AdaptiveSheet
      accessibilityLabel="Resume your match"
      kind="dialog"
      onClose={() => setDismissed(true)}
      visible={visible}
    >
      {view ? (
        <View
          style={{ padding: tokens.space["5"], gap: tokens.space["3"] }}
          testID="live-resume"
        >
          <Title size={24}>Resume your match?</Title>
          <Text tone="text-2" variant="phone-body">
            {`${view.names.home} against ${view.names.away}, set ${view.setNumber}, ${formatSetScore(view.points.A, view.points.B)}. Every point is saved on this phone.`}
          </Text>
          <ActionButton
            label="Resume"
            onPress={() => {
              setDismissed(true);
              onResume();
            }}
            testID="resume-match"
          />
          <ActionButton
            kind="secondary"
            label="Not now"
            onPress={() => setDismissed(true)}
          />
        </View>
      ) : null}
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: "row" },
  middle: { flex: 1.3, justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center" },
  headerText: { flex: 1, gap: 2 },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  card: { borderWidth: StyleSheet.hairlineWidth },
  calls: { alignItems: "flex-start" },
  callRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttons: { flex: 1, flexDirection: "row" },
  pointButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 160,
  },
  pointHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  centerText: { textAlign: "center" },
  controls: { flexDirection: "row" },
  control: {
    flex: 1,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  board: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  boardSide: { flex: 1, alignItems: "center" },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logScore: { minWidth: 64 },
});
