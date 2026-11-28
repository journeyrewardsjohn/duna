/**
 * Check-in and attendance on the sand (M-R2, PART-12; participation.md §7.4
 * "Attendance (on the sand)"; persona CH-3.n, CH-7.2). A whole-window
 * checklist built for one hand in sunlight:
 *
 * - "Everyone's here" (tap 1), then confirm (tap 2); exceptions are a tap on
 *   a person (56 pt rows, words and an icon, never colour alone);
 * - every mark is saved on this phone first, with the phone's time and an
 *   idempotency key, and sent in order when there is signal; Undo for 6 s;
 * - the server's answer wins and is shown plainly when it disagrees.
 *
 * The open Duo puts the count and "Everyone's here" left and the roster
 * right; propped half-open, the count is on the top pane and the roster
 * toggles on the bottom pane (the touch region).
 */
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  EmptyState,
  FoldScaffold,
  Icon,
  LoadingState,
  Rise,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShell } from "../../app/ShellContext";
import { IconButton } from "../../app/ui";
import { pendingForSession, UNDO_MS } from "./attendance-queue";
import { ActionButton, Notice, useMinuteClock } from "./parts";
import {
  effectiveAttendance,
  rosterOrder,
  rosterSummary,
  sessionPhase,
  sessionWhen,
  type SessionDetail,
  type SessionPerson,
} from "./session-model";
import { useAttendance } from "./use-attendance";
import { useSession } from "./use-session";

interface UndoState {
  readonly ids: readonly string[];
  readonly label: string;
  readonly at: number;
}

export function AttendanceScreen({
  sessionId,
}: {
  readonly sessionId: string | undefined;
}) {
  const shell = useShell();
  const { load, reload } = useSession(sessionId);
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();

  const top = (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + tokens.space["2"],
          paddingLeft: insets.left + tokens.space["4"],
          paddingRight: insets.right + tokens.space["4"],
          borderBottomColor: colors.line,
        },
      ]}
    >
      <IconButton
        icon="close"
        label="Close"
        onPress={shell.closeWindow}
        testID="attendance-close"
      />
      <View style={styles.flex}>
        <Text accessibilityRole="header" variant="phone-heading">
          {load.status === "ready" &&
          sessionPhase(load.detail, Date.now()) === "ended"
            ? "Take attendance"
            : "Check in"}
        </Text>
        {load.status === "ready" ? (
          <Text tone="text-2" variant="phone-meta">
            {`${load.detail.title} · ${sessionWhen(load.detail)}`}
          </Text>
        ) : null}
      </View>
    </View>
  );

  let body: ReactNode;
  if (
    load.status === "loading" ||
    (load.status === "ready" && load.rosterLoading)
  ) {
    body = (
      <View style={{ padding: tokens.space["4"] }}>
        <LoadingState
          count={5}
          label="Loading the roster"
          loading
          skeleton="row"
        />
      </View>
    );
  } else if (load.status === "ready") {
    body = <Checklist detail={load.detail} reload={reload} />;
  } else {
    body = (
      <View style={{ padding: tokens.space["4"] }}>
        <EmptyState
          action={{ label: "Close", onPress: shell.closeWindow }}
          text={
            load.status === "failed" && load.failure.kind === "offline"
              ? "This roster isn't saved on this phone yet. Open the session once with signal and it will be."
              : "Open it again from Today or Schedule."
          }
          title="The roster isn't available"
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="attendance-screen"
    >
      {top}
      {body}
    </View>
  );
}

function Checklist({
  detail,
  reload,
}: {
  readonly detail: SessionDetail;
  readonly reload: () => Promise<void>;
}) {
  const attendance = useAttendance();
  const haptics = useHaptics();
  const now = useMinuteClock();
  const region = useRegionLayout();
  const insets = useSafeAreaInsets();
  const { colors, tokens } = useTheme();
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [undo, setUndo] = useState<UndoState | null>(null);

  const pending = pendingForSession(attendance.state, detail.id);
  const queued = useMemo(
    () => new Map(pending.map((mark) => [mark.bookingId, mark.status])),
    [pending],
  );
  const roster = rosterOrder(detail.people).filter(
    (person) => person.active && person.bookingId,
  );
  const summary = rosterSummary(roster, queued);
  const phase = sessionPhase(detail, now);
  // Group sessions: Duna accepts attendance from the start (§8).
  const opensAtStart = detail.attendanceTarget === "participation";
  const notOpenYet = opensAtStart && now < detail.startsAt;
  const closed = phase === "closed" || phase === "cancelled";
  const disabled = notOpenYet || closed || !detail.attendanceTarget;
  const failing = pending.some((mark) => mark.attempts > 0);
  const conflicts = attendance.state.conflicts.filter(
    (conflict) => conflict.sessionId === detail.id,
  );

  // Undo lives as long as the queue's hold.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.at + UNDO_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);

  // When everything has left the phone, refresh the roster from Duna.
  const hadPending = useRef(false);
  useEffect(() => {
    if (pending.length > 0) hadPending.current = true;
    else if (hadPending.current) {
      hadPending.current = false;
      void reload();
    }
  }, [pending.length, reload]);

  const markPerson = (person: SessionPerson) => {
    if (disabled || !person.bookingId || !detail.attendanceTarget) return;
    const current = effectiveAttendance(person, queued);
    const next = current === "attended" ? "absent" : "attended";
    haptics.selection();
    const id = attendance.mark({
      target: detail.attendanceTarget,
      sessionId: detail.id,
      bookingId: person.bookingId,
      personName: person.displayName,
      status: next,
    });
    setUndo({
      ids: [id],
      label: `${person.displayName} marked ${next === "attended" ? "here" : "absent"}`,
      at: Date.now(),
    });
  };

  const markEveryone = () => {
    if (disabled || !detail.attendanceTarget) return;
    const target = detail.attendanceTarget;
    const unmarked = roster.filter(
      (person) => effectiveAttendance(person, queued) === null,
    );
    const ids = unmarked.map((person) =>
      attendance.mark({
        target,
        sessionId: detail.id,
        bookingId: person.bookingId!,
        personName: person.displayName,
        status: "attended",
      }),
    );
    haptics.confirmed(1);
    setConfirmingAll(false);
    setUndo({
      ids,
      label: `${ids.length} ${ids.length === 1 ? "person" : "people"} marked here`,
      at: Date.now(),
    });
  };

  const undoLast = () => {
    if (!undo) return;
    for (const id of undo.ids) attendance.undo(id);
    haptics.confirmed(0);
    setUndo(null);
  };

  const unmarkedCount = summary.unmarked;

  const counts = (large: boolean) => (
    <View
      accessibilityLabel={`${summary.booked} booked. ${summary.here} marked here. ${summary.absent} absent.`}
      accessible
      style={styles.counts}
      testID="attendance-counts"
    >
      <Count label="booked" large={large} value={summary.booked} />
      <Count label="here" large={large} tone="positive" value={summary.here} />
      <Count
        label="absent"
        large={large}
        tone="danger"
        value={summary.absent}
      />
    </View>
  );

  const status = (
    <>
      {notOpenYet ? (
        <Notice
          testID="attendance-not-open"
          text="Duna accepts marks for this group session from its start time."
          title="Attendance opens when the session starts"
          tone="info"
        />
      ) : null}
      {closed ? (
        <Notice
          text="Duna no longer accepts marks for this session."
          title="Attendance for this session has closed"
          tone="warning"
        />
      ) : null}
      {pending.length ? (
        <Notice
          testID="attendance-saved-on-phone"
          text={
            failing
              ? "Sends when you're back online, in the order you marked."
              : "Sending now."
          }
          title={`Saved on this phone · ${pending.length} mark${pending.length === 1 ? "" : "s"}`}
          tone={failing ? "warning" : "info"}
        />
      ) : summary.here + summary.absent > 0 ? (
        <Text tone="text-2" variant="phone-meta" testID="attendance-all-sent">
          Every mark is saved in Duna.
        </Text>
      ) : null}
      {conflicts.map((conflict) => (
        <Notice
          action="OK"
          key={conflict.id}
          onAction={() => attendance.dismiss(conflict.id)}
          testID="attendance-conflict"
          text={conflict.message}
          title="Duna kept a different answer"
          tone="warning"
        />
      ))}
    </>
  );

  const everyone = confirmingAll ? (
    <View style={styles.confirmRow} testID="attendance-confirm-all">
      <ActionButton
        kind="primary"
        label={`Mark ${unmarkedCount} ${unmarkedCount === 1 ? "person" : "people"} here`}
        onPress={markEveryone}
        style={styles.grow}
        testID="attendance-confirm-all-yes"
      />
      <ActionButton
        label="Not yet"
        onPress={() => setConfirmingAll(false)}
        style={styles.grow}
      />
    </View>
  ) : (
    <Pressable
      accessibilityHint="Asks once more, then marks everyone not yet marked as here"
      accessibilityLabel="Everyone's here"
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || unmarkedCount === 0 }}
      disabled={disabled || unmarkedCount === 0}
      onPress={() => {
        haptics.selection();
        setConfirmingAll(true);
      }}
      style={({ pressed }) => [
        styles.everyone,
        {
          backgroundColor:
            disabled || unmarkedCount === 0
              ? colors["action-disabled"]
              : colors.action,
          borderRadius: tokens.radius.xl,
        },
        pressed ? styles.pressed : null,
      ]}
      testID="attendance-everyone"
    >
      <Icon
        name="users"
        size="nav"
        tone={disabled || unmarkedCount === 0 ? "text-disabled" : "on-action"}
      />
      <Text
        tone={disabled || unmarkedCount === 0 ? "text-disabled" : "on-action"}
        variant="phone-heading"
      >
        Everyone's here
      </Text>
    </Pressable>
  );

  const list = (
    <View role="list" style={styles.list} testID="attendance-roster">
      {roster.length === 0 ? (
        <EmptyState
          compact
          text="People who book show up here."
          title="No one booked"
        />
      ) : (
        roster.map((person) => (
          <AttendanceRow
            disabled={disabled}
            key={person.key}
            mark={effectiveAttendance(person, queued)}
            onPress={() => markPerson(person)}
            onPhone={person.bookingId ? queued.has(person.bookingId) : false}
            person={person}
          />
        ))
      )}
    </View>
  );

  const undoBar = undo ? (
    <Rise from="bottom" trigger={undo.at}>
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.undo,
          {
            backgroundColor: colors.action,
            borderRadius: tokens.radius.lg,
            marginBottom: insets.bottom + tokens.space["3"],
          },
        ]}
        testID="attendance-undo"
      >
        <Text
          style={styles.flex}
          tone="on-action"
          variant="phone-body"
          weight={600}
        >
          {undo.label}
        </Text>
        <Pressable
          accessibilityLabel="Undo"
          accessibilityRole="button"
          hitSlop={8}
          onPress={undoLast}
          style={styles.undoButton}
        >
          <Icon name="undo" size="control" tone="on-action" />
          <Text tone="on-action" variant="phone-body" weight={600}>
            Undo
          </Text>
        </Pressable>
      </View>
    </Rise>
  ) : null;

  const pad = {
    paddingTop: tokens.space["4"],
    paddingLeft: insets.left + tokens.space["4"],
    paddingRight: insets.right + tokens.space["4"],
    paddingBottom: insets.bottom + tokens.space["8"] + (undo ? 72 : 0),
    gap: tokens.space["4"],
  };

  let content: ReactNode;
  if (region.layout.mode === "tabletop") {
    content = (
      <FoldScaffold
        layout={region.layout}
        primary={
          <View style={[styles.tabletopTop, { padding: tokens.space["6"] }]}>
            {counts(true)}
            <Text tabular variant="figure-sm" weight={600}>
              {`${summary.booked} booked · ${summary.here} marked here`}
            </Text>
          </View>
        }
        secondary={
          <ScrollView contentContainerStyle={pad}>
            {status}
            {everyone}
            {list}
          </ScrollView>
        }
        tabletop="auto"
      />
    );
  } else if (region.layout.paneCount >= 2) {
    content = (
      <View style={styles.columns}>
        <ScrollView contentContainerStyle={pad} style={styles.column}>
          {counts(true)}
          {everyone}
          {status}
        </ScrollView>
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        <ScrollView contentContainerStyle={pad} style={styles.column}>
          {list}
        </ScrollView>
      </View>
    );
  } else {
    content = (
      <ScrollView contentContainerStyle={pad}>
        {counts(false)}
        {everyone}
        {status}
        {list}
      </ScrollView>
    );
  }

  return (
    <View onLayout={region.onLayout} ref={region.ref} style={styles.fill}>
      {content}
      <View pointerEvents="box-none" style={styles.undoHost}>
        {undoBar}
      </View>
    </View>
  );
}

function Count({
  label,
  value,
  large,
  tone = "text",
}: {
  readonly label: string;
  readonly value: number;
  readonly large: boolean;
  readonly tone?: "text" | "positive" | "danger";
}) {
  return (
    <View style={styles.count}>
      <Text
        tabular
        tone={tone}
        variant={large ? "display-sm" : "figure"}
        weight={600}
      >
        {String(value)}
      </Text>
      <Text tone="text-2" variant="phone-meta" weight={600}>
        {label}
      </Text>
    </View>
  );
}

/** One person: 56 pt or taller, the whole row is the target. */
function AttendanceRow({
  person,
  mark,
  onPhone,
  disabled,
  onPress,
}: {
  readonly person: SessionPerson;
  readonly mark: "attended" | "absent" | null;
  readonly onPhone: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  const word =
    mark === "attended" ? "Here" : mark === "absent" ? "Absent" : "Not marked";
  const tone =
    mark === "attended" ? "positive" : mark === "absent" ? "danger" : "text-2";
  const wash =
    mark === "attended"
      ? colors["positive-wash"]
      : mark === "absent"
        ? colors["danger-wash"]
        : colors.surface;
  return (
    <View role="listitem">
      <Pressable
        accessibilityHint={
          disabled
            ? undefined
            : mark === "attended"
              ? "Marks absent"
              : "Marks here"
        }
        accessibilityLabel={[
          person.displayName,
          person.guardianNote,
          word,
          onPhone ? "saved on this phone" : undefined,
        ]
          .filter(Boolean)
          .join(". ")}
        accessibilityRole="button"
        accessibilityState={{ disabled, checked: mark === "attended" }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: wash,
            borderColor: mark ? colors[tone] : colors["line-strong"],
            borderRadius: tokens.radius.lg,
          },
          pressed ? styles.pressed : null,
          disabled ? styles.dim : null,
        ]}
        testID={`attendance-row-${person.key}`}
      >
        <View style={styles.flex}>
          <Text variant="phone-body" weight={600}>
            {person.displayName}
          </Text>
          {person.guardianNote || onPhone ? (
            <Text tone="text-2" variant="phone-meta">
              {[
                person.guardianNote,
                onPhone ? "Saved on this phone" : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
        <View style={styles.markCell}>
          <Icon
            name={
              mark === "attended"
                ? "check"
                : mark === "absent"
                  ? "close"
                  : "minus"
            }
            size="control"
            tone={tone}
          />
          <Text tone={tone} variant="phone-body" weight={600}>
            {word}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  grow: { flexGrow: 1, flexShrink: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
  count: { minWidth: 72 },
  everyone: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  confirmRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  list: { gap: 8 },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  markCell: { flexDirection: "row", alignItems: "center", gap: 6 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  dim: { opacity: 0.55 },
  columns: { flex: 1, flexDirection: "row" },
  column: { flex: 1 },
  divider: { width: StyleSheet.hairlineWidth },
  tabletopTop: { flex: 1, justifyContent: "center", gap: 12 },
  undoHost: { position: "absolute", left: 16, right: 16, bottom: 0 },
  undo: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  undoButton: {
    minHeight: 48,
    minWidth: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
