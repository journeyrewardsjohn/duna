/**
 * My availability (M-R5, board P18-Availability; persona CH-1.n): the week
 * as blocks read at a glance and edited with thumbs, always restated in the
 * shared sentence ("Available Mon and Wed evenings, Sat mornings").
 *
 * - The schedule in force is edited in place; a new schedule starts on a
 *   date ("Winter term from 1 December") through `transitionSchedule`, which
 *   ends the earlier one the day before. Drafts never count until started.
 * - Save is explicit and single-submit. Before it, the booked sessions the
 *   change leaves outside my hours are listed by the shared rule, with what
 *   Duna does: they stay booked with me and are listed for the club's
 *   managers as needing cover (B3a opens a coverage need for each, reason
 *   "hours changed"); nobody is moved until a manager assigns someone.
 * - Undo is offered when the API can take the change back cleanly (an edit
 *   in place that moved no booked session out of my hours).
 * - Read from the last good copy without signal; edits need a connection.
 *
 * Arrangement by the screen's own region, never the device: one column
 * with the day editor in a sheet (iPhone, the closed Duo); the week beside
 * the day editor (the open Duo, a half-width iPad); the week, the editor
 * and the affected sessions side by side (a full iPad); on the Duo propped
 * half-open, the week on the top pane and the editor on the bottom.
 */
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import {
  AdaptiveSheet,
  EmptyState,
  FoldScaffold,
  Icon,
  LoadingState,
  PermissionDeniedState,
  Rally,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { DayStrip } from "@duna/ui/native/time";
import { localDateOf, scheduleInForce } from "@duna/scheduling";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, IconButton, SectionHead, usePaneEdges } from "../../app/ui";
import { ConfirmSheet } from "../session/ConfirmSheet";
import { DunaTextInput } from "../session/duna-text";
import { ActionButton, Notice } from "../session/parts";
import { DayEditor } from "./DayEditor";
import {
  FailureView,
  FreshLine,
  PaneScroll,
  ToneChip,
  UndoToast,
} from "./parts";
import {
  availabilitySummary,
  dayMonth,
  scheduleStatusCopy,
  toRuleSchedule,
  weekdayLong,
  weekdayShort,
  weekOrder,
  windowKindLabels,
  type ScheduleRow,
} from "./team-words";
import {
  useAvailability,
  type AvailabilityData,
  type ScheduleOut,
  type StaffPage,
} from "./use-availability";
import { MyTeamGate, useMySessions, type MyTeam } from "./use-my-team";
import {
  WEEK_PATTERNS,
  blockProblem,
  blockSpokenLabel,
  blockTimeLabel,
  blocksFromPattern,
  blocksFromWindows,
  blocksOn,
  draftSentence,
  sameWeek,
  scheduleConflicts,
  sessionWhenWords,
  windowsFromBlocks,
  type MySession,
  type ScheduleChange,
  type SessionConflict,
  type WeekBlock,
} from "./week-model";

export function AvailabilityScreen() {
  return (
    <MyTeamGate>
      {(state) =>
        state.status === "ready" ? (
          <AvailabilityLoader team={state.team} />
        ) : (
          <NotOnTeam />
        )
      }
    </MyTeamGate>
  );
}

/** Signed in, but not on this club's team list. */
export function NotOnTeam() {
  return (
    <PaneScroll testID="team-not-on-team">
      <PermissionDeniedState
        what="team availability, cover and pay at this club"
        who="the owner or a manager to add you to the team in Duna HQ, with the email you sign in with, and"
      />
    </PaneScroll>
  );
}

function AvailabilityLoader({ team }: { readonly team: MyTeam }) {
  const data = useAvailability(team);
  const sessions = useMySessions(team);
  const { load } = data;
  if (load.status === "loading" && !load.data) {
    return (
      <PaneScroll testID="availability-loading">
        <LoadingState
          count={4}
          label="Loading your availability"
          loading
          skeleton="row"
        />
      </PaneScroll>
    );
  }
  if (!load.data) {
    return (
      <PaneScroll testID="availability-failed">
        <FailureView
          failure={load.failure ?? { kind: "error" }}
          onRetry={() => void load.reload()}
          what="your availability"
        />
      </PaneScroll>
    );
  }
  return (
    <AvailabilityReady
      data={data}
      page={load.data}
      sessions={sessions}
      team={team}
    />
  );
}

type Target =
  | { readonly kind: "existing"; readonly scheduleId: string }
  | {
      readonly kind: "new";
      readonly name: string;
      readonly effectiveFrom: string;
    };

/** The schedule the screen opens on: in force today, else a draft. */
function initialTarget(page: StaffPage, today: string): Target | null {
  const inForce = scheduleInForce(page.schedules.map(toRuleSchedule), today);
  if (inForce) return { kind: "existing", scheduleId: inForce.id };
  const draft = page.schedules.find((schedule) => schedule.status === "draft");
  if (draft) return { kind: "existing", scheduleId: draft.id };
  const latest = page.schedules.find(
    (schedule) => schedule.status !== "archived",
  );
  return latest ? { kind: "existing", scheduleId: latest.id } : null;
}

function AvailabilityReady({
  team,
  page,
  data,
  sessions,
}: {
  readonly team: MyTeam;
  readonly page: StaffPage;
  readonly data: AvailabilityData;
  readonly sessions: readonly MySession[];
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const region = useRegionLayout();
  const edges = usePaneEdges();
  // In a split window the day sheet covers this pane: keep it clear of the
  // status bar and the Duo's trailing tab bar (the window's safe area, since
  // the route's own safe area is measured below its header).
  const windowSafe = region.windowLayout.safeArea;
  const inPane = region.windowLayout.paneCount >= 2;
  const sheetInsets = {
    top: inPane ? windowSafe.top : 0,
    right: inPane ? windowSafe.right : 0,
    bottom: windowSafe.bottom,
  };
  const now = new Date().toISOString();
  const today = localDateOf(Date.now(), team.timeZone);
  const [target, setTarget] = useState<Target | null>(() =>
    initialTarget(page, today),
  );
  const schedule: ScheduleOut | undefined =
    target?.kind === "existing"
      ? page.schedules.find((row) => row.id === target.scheduleId)
      : undefined;
  const savedBlocks = useMemo(
    () => (schedule ? blocksFromWindows(schedule.windows) : []),
    [schedule],
  );
  const [blocks, setBlocks] = useState<readonly WeekBlock[]>(savedBlocks);
  const [day, setDay] = useState<number>(() => {
    const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
    return weekday;
  });
  const [dayOpen, setDayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState<ScheduleOut | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);

  // A different schedule (or a fresh copy from Duna) resets the editor.
  const targetKey =
    target?.kind === "existing"
      ? `${target.scheduleId}:${schedule?.updatedAt ?? ""}`
      : target
        ? `new:${target.effectiveFrom}`
        : "none";
  const lastKey = useRef(targetKey);
  useEffect(() => {
    if (lastKey.current === targetKey) return;
    lastKey.current = targetKey;
    if (target?.kind === "existing") setBlocks(savedBlocks);
  }, [savedBlocks, target, targetKey]);

  const dirty = target?.kind === "new" || !sameWeek(blocks, savedBlocks);
  const problems = blocks
    .map((block) => blockProblem(block, blocks))
    .filter(Boolean);
  const offline = data.load.stale && data.load.failure?.kind === "offline";

  const change: ScheduleChange = useMemo(() => {
    if (!target) return { kind: "draft" };
    if (target.kind === "new")
      return { kind: "start", effectiveFrom: target.effectiveFrom, blocks };
    if (
      !schedule ||
      schedule.status === "draft" ||
      schedule.status === "archived"
    )
      return { kind: "draft" };
    return {
      kind: "replace",
      scheduleId: schedule.id,
      effectiveFrom: schedule.effectiveFrom,
      ...(schedule.effectiveTo ? { effectiveTo: schedule.effectiveTo } : {}),
      blocks,
    };
  }, [blocks, schedule, target]);

  const conflicts = useMemo(
    () =>
      scheduleConflicts({
        sessions,
        schedules: page.schedules as readonly ScheduleRow[],
        change,
        timeZone: team.timeZone,
        now,
      }),
    // `now` moves every render; the list only needs the edit to change it.
    [change, page.schedules, sessions, team.timeZone],
  );

  const currentSentence = availabilitySummary({
    schedules: page.schedules as readonly ScheduleRow[],
    blackouts: page.blackouts,
    timeOff: page.timeOff,
    now,
    timeZone: team.timeZone,
  });
  const nextSentence = draftSentence({
    blocks,
    timeZone: team.timeZone,
    now,
  });

  const chooseDay = (weekday: number) => {
    haptics.confirmed(0);
    setDay(weekday);
    if (region.layout.paneCount < 2 && region.layout.mode !== "tabletop")
      setDayOpen(true);
  };

  const startPattern = (key: string) => {
    const pattern = WEEK_PATTERNS.find((item) => item.key === key);
    if (!pattern) return;
    setTarget({
      kind: "new",
      name: "Weekly availability",
      effectiveFrom: today,
    });
    setBlocks(blocksFromPattern(pattern));
    setSaving(true);
  };

  /* -------------------------------------------------------------- parts */

  const header = (
    <View style={styles.block} testID="availability-header">
      <FreshLine
        failure={data.load.failure}
        lastFreshAt={data.load.lastFreshAt}
        onRetry={() => void data.load.reload()}
        stale={data.load.stale}
      />
      <Card>
        <Text tone="text-2" variant="phone-meta" weight={600}>
          Now
        </Text>
        <Text testID="availability-sentence" variant="phone-heading">
          {currentSentence}
        </Text>
        {dirty && target ? (
          <View style={styles.after}>
            <Text tone="text-2" variant="phone-meta" weight={600}>
              {target.kind === "new"
                ? `From ${dayMonth(target.effectiveFrom)}`
                : "After you save"}
            </Text>
            <Text
              testID="availability-draft-sentence"
              variant="phone-body"
              weight={600}
            >
              {nextSentence}
            </Text>
          </View>
        ) : null}
        <Text tone="text-2" variant="phone-meta">
          {`Times are your club's local time (${team.timeZone.replaceAll("_", " ")}).`}
        </Text>
      </Card>
    </View>
  );

  const statusOrder = { active: 0, fallback: 1, draft: 2, archived: 3 };
  const schedules = page.schedules
    .filter((row) => row.status !== "archived")
    .sort(
      (left, right) =>
        statusOrder[left.status] - statusOrder[right.status] ||
        right.effectiveFrom.localeCompare(left.effectiveFrom),
    );
  const scheduleChooser = (
    <View style={styles.block}>
      <SectionHead
        action="New from a date"
        onAction={() => setCreating(true)}
        title="Schedules"
      />
      {schedules.map((row) => {
        const selected =
          target?.kind === "existing" && target.scheduleId === row.id;
        return (
          <Pressable
            accessibilityHint="Shows this schedule's week"
            accessibilityLabel={`${row.name}, ${scheduleStatusCopy(row.status).label}, ${scheduleDates(row)}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={row.id}
            onPress={() => {
              haptics.confirmed(0);
              setTarget({ kind: "existing", scheduleId: row.id });
            }}
            style={({ pressed }) => [
              styles.scheduleRow,
              {
                backgroundColor: selected
                  ? colors["action-soft"]
                  : colors.surface,
                borderColor: selected ? colors.action : colors.line,
                borderRadius: tokens.radius.lg,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
            testID={`schedule-${row.id}`}
          >
            <View style={styles.flex}>
              <Text variant="phone-body" weight={600}>
                {row.name}
              </Text>
              <Text tone="text-2" variant="phone-meta">
                {scheduleDates(row)}
              </Text>
            </View>
            <ToneChip copy={scheduleStatusCopy(row.status)} />
          </Pressable>
        );
      })}
      {target?.kind === "new" ? (
        <Notice
          text={`Starts on ${dayMonth(target.effectiveFrom)}. Until then your current schedule stays in force.`}
          title={`New: ${target.name}`}
          tone="info"
        />
      ) : null}
      {schedule?.status === "draft" ? (
        <Notice
          action="Start using"
          onAction={() => setStarting(schedule)}
          text={`A draft never counts. Start it to use it from ${dayMonth(schedule.effectiveFrom)}.`}
          title="This is a draft"
          tone="info"
        />
      ) : null}
    </View>
  );

  const week = (
    <View style={styles.block} testID="availability-week">
      <SectionHead title="Your week" />
      {weekOrder.map((weekday) => (
        <WeekDayRow
          blocks={blocksOn(blocks, weekday)}
          key={weekday}
          onPress={() => chooseDay(weekday)}
          selected={region.layout.paneCount >= 2 && day === weekday}
          weekday={weekday}
        />
      ))}
    </View>
  );

  const editor = target ? (
    <DayEditor
      blocks={blocks}
      disabled={offline}
      onChange={(next) => setBlocks(next)}
      weekday={day}
    />
  ) : null;

  const conflictsBlock =
    change.kind !== "draft" && dirty ? (
      <ConflictList conflicts={conflicts} timeZone={team.timeZone} />
    ) : null;

  const saveBar =
    target && dirty ? (
      <View style={styles.block} testID="availability-save">
        {offline ? (
          <Notice
            text="Your edits are kept on this screen. Saving needs a connection so a change never meets bookings you can't see."
            title="Saving needs a connection"
            tone="warning"
          />
        ) : null}
        <ActionButton
          disabled={offline || problems.length > 0}
          hint={
            problems.length > 0
              ? "Fix the blocks marked in red first"
              : "Reviews the change before saving"
          }
          icon="check"
          kind="primary"
          label={
            target.kind === "new"
              ? `Review: starts ${dayMonth(target.effectiveFrom)}`
              : "Review and save"
          }
          onPress={() => setSaving(true)}
          testID="availability-review"
        />
        <ActionButton
          label="Discard changes"
          onPress={() => {
            if (target.kind === "new") setTarget(initialTarget(page, today));
            setBlocks(savedBlocks);
          }}
          testID="availability-discard"
        />
      </View>
    ) : null;

  const empty =
    page.schedules.length === 0 && target === null ? (
      <View style={styles.block} testID="availability-empty">
        <EmptyState
          text="Pick a usual week to start. You can change any day after."
          title="No availability yet"
        />
        <Rally>
          {WEEK_PATTERNS.map((pattern) => (
            <Card
              accessibilityHint="Reviews this week before saving"
              accessibilityLabel={`${pattern.title}: ${draftSentence({ blocks: blocksFromPattern(pattern), timeZone: team.timeZone, now })}`}
              key={pattern.key}
              onPress={() => startPattern(pattern.key)}
              testID={`pattern-${pattern.key}`}
            >
              <Text variant="phone-body" weight={600}>
                {pattern.title}
              </Text>
              <Text tone="text-2" variant="phone-meta">
                {draftSentence({
                  blocks: blocksFromPattern(pattern),
                  timeZone: team.timeZone,
                  now,
                })}
              </Text>
            </Card>
          ))}
        </Rally>
        <ActionButton
          icon="plus"
          label="Build my week day by day"
          onPress={() => {
            setTarget({
              kind: "new",
              name: "Weekly availability",
              effectiveFrom: today,
            });
            setBlocks([]);
          }}
          testID="availability-build"
        />
      </View>
    ) : null;

  /* ------------------------------------------------------- arrangement */

  const scroll = (children: ReactNode, testID?: string) => (
    <ScrollView
      contentContainerStyle={{
        paddingTop: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["12"],
        paddingHorizontal: tokens.space["4"],
        gap: tokens.space["5"],
      }}
      keyboardShouldPersistTaps="handled"
      style={styles.column}
      testID={testID}
    >
      {children}
    </ScrollView>
  );

  let body: ReactNode;
  if (empty) {
    body = scroll(
      <>
        {header}
        {empty}
      </>,
      "availability-screen-scroll",
    );
  } else if (region.layout.mode === "tabletop") {
    body = (
      <FoldScaffold
        layout={region.layout}
        primary={scroll(
          <>
            {header}
            {week}
          </>,
        )}
        secondary={scroll(
          <>
            {editor}
            {conflictsBlock}
            {saveBar}
          </>,
        )}
        tabletop="auto"
      />
    );
  } else if (region.layout.paneCount >= 3) {
    body = (
      <View style={styles.columns}>
        {scroll(
          <>
            {header}
            {scheduleChooser}
            {week}
          </>,
          "availability-week-column",
        )}
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        {scroll(
          <>
            {editor}
            {saveBar}
          </>,
          "availability-editor-column",
        )}
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        {scroll(
          conflictsBlock ?? (
            <ConflictList conflicts={[]} timeZone={team.timeZone} idle />
          ),
          "availability-sessions-column",
        )}
      </View>
    );
  } else if (region.layout.paneCount === 2) {
    body = (
      <View style={styles.columns}>
        {scroll(
          <>
            {header}
            {scheduleChooser}
            {week}
          </>,
          "availability-week-column",
        )}
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        {scroll(
          <>
            {editor}
            {conflictsBlock}
            {saveBar}
          </>,
          "availability-editor-column",
        )}
      </View>
    );
  } else {
    body = scroll(
      <>
        {header}
        {scheduleChooser}
        {week}
        {conflictsBlock}
        {saveBar}
      </>,
      "availability-screen-scroll",
    );
  }

  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="availability-screen"
    >
      {body}
      <AdaptiveSheet
        accessibilityLabel={`${weekdayLong[day]} hours`}
        kind="panel"
        onClose={() => setDayOpen(false)}
        testID="day-sheet"
        visible={dayOpen && region.layout.paneCount < 2}
      >
        <View
          style={[
            styles.sheetHead,
            {
              paddingLeft: tokens.space["4"],
              paddingRight: sheetInsets.right + tokens.space["4"],
              paddingTop: sheetInsets.top,
            },
          ]}
        >
          <Text style={styles.flex} tone="text-2" variant="phone-meta">
            Changes are saved when you review and save the week.
          </Text>
          <IconButton
            icon="close"
            label="Done"
            onPress={() => setDayOpen(false)}
          />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingLeft: tokens.space["4"],
            paddingRight: sheetInsets.right + tokens.space["4"],
            paddingBottom: sheetInsets.bottom + tokens.space["8"],
            gap: tokens.space["4"],
          }}
        >
          {editor}
          <ActionButton
            kind="primary"
            label="Done"
            onPress={() => setDayOpen(false)}
            testID="day-sheet-done"
          />
        </ScrollView>
      </AdaptiveSheet>
      <SaveSheet
        blocks={blocks}
        conflicts={conflicts}
        data={data}
        nextSentence={nextSentence}
        onClose={() => setSaving(false)}
        onSaved={(result) => {
          setSaving(false);
          if (result.target) setTarget(result.target);
          setToast(result.toast);
        }}
        schedule={schedule}
        target={target}
        team={team}
        visible={saving}
      />
      <StartSheet
        conflicts={
          starting
            ? scheduleConflicts({
                sessions,
                schedules: page.schedules as readonly ScheduleRow[],
                change: {
                  kind: "start",
                  effectiveFrom: starting.effectiveFrom,
                  ...(starting.effectiveTo
                    ? { effectiveTo: starting.effectiveTo }
                    : {}),
                  blocks: blocksFromWindows(starting.windows),
                },
                timeZone: team.timeZone,
                now,
              })
            : []
        }
        data={data}
        onClose={() => setStarting(null)}
        onDone={(text) => setToast({ text })}
        schedule={starting}
        team={team}
      />
      <NewScheduleSheet
        onClose={() => setCreating(false)}
        onCreate={(name, effectiveFrom) => {
          setCreating(false);
          setTarget({ kind: "new", name, effectiveFrom });
          // Start from the week in force, which is what most changes keep.
          setBlocks(savedBlocks.length ? savedBlocks : blocks);
        }}
        team={team}
        today={today}
        visible={creating}
      />
      <UndoToast
        onDismiss={() => setToast(null)}
        onUndo={toast?.undo}
        text={toast?.text ?? null}
      />
    </View>
  );
}

function scheduleDates(row: ScheduleOut): string {
  if (row.status === "fallback") return "Whenever no other schedule applies";
  return row.effectiveTo
    ? `${dayMonth(row.effectiveFrom)} to ${dayMonth(row.effectiveTo)}`
    : `From ${dayMonth(row.effectiveFrom)}`;
}

/** One weekday in the week list: its blocks as pills, read as one line. */
function WeekDayRow({
  weekday,
  blocks,
  selected,
  onPress,
}: {
  readonly weekday: number;
  readonly blocks: readonly WeekBlock[];
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  const spoken =
    blocks.length === 0
      ? `${weekdayLong[weekday]}, not available`
      : blocks.map(blockSpokenLabel).join("; ");
  return (
    <Pressable
      accessibilityHint={`Edits ${weekdayLong[weekday]}`}
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayRow,
        {
          backgroundColor: selected ? colors["action-soft"] : colors.surface,
          borderColor: selected ? colors.action : colors.line,
          borderRadius: tokens.radius.lg,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
      testID={`week-day-${weekday}`}
    >
      <Text style={styles.dayName} variant="phone-body" weight={600}>
        {weekdayShort[weekday]}
      </Text>
      <View style={styles.pills}>
        {blocks.length === 0 ? (
          <Text tone="text-3" variant="phone-meta">
            Not available
          </Text>
        ) : (
          blocks.map((block) => (
            <View
              key={block.key}
              style={[
                styles.pill,
                {
                  backgroundColor:
                    block.kind === "coaching"
                      ? colors["positive-wash"]
                      : colors["surface-sunken"],
                  borderRadius: tokens.radius.md,
                },
              ]}
            >
              <Text tabular variant="phone-meta" weight={600}>
                {blockTimeLabel(block)}
              </Text>
              {block.kind !== "coaching" ? (
                <Text tone="text-2" variant="phone-meta">
                  {block.label ?? windowKindLabels[block.kind]}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
      <Icon name="chevron-right" size="inline" tone="text-3" />
    </Pressable>
  );
}

/** The booked sessions a change leaves outside my hours, and what happens. */
function ConflictList({
  conflicts,
  timeZone,
  idle = false,
}: {
  readonly conflicts: readonly SessionConflict[];
  readonly timeZone: string;
  readonly idle?: boolean;
}) {
  const newly = conflicts.filter((session) => session.newlyOutside);
  const already = conflicts.filter((session) => !session.newlyOutside);
  if (idle) {
    return (
      <View style={styles.block}>
        <SectionHead title="Booked sessions" />
        <Text tone="text-2" variant="phone-body">
          When you change your week, the sessions it would leave outside your
          hours are listed here before you save.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.block} testID="availability-conflicts">
      <SectionHead title="Booked sessions" />
      {conflicts.length === 0 ? (
        <Notice
          text="Every session you're booked to coach still fits your hours."
          title="No booked session is affected"
          tone="positive"
        />
      ) : (
        <>
          {newly.length > 0 ? (
            <Notice
              text="They stay booked with you. Duna lists each one for your club's managers as needing cover; nobody is moved until a manager assigns someone."
              title={`${newly.length} booked ${newly.length === 1 ? "session moves" : "sessions move"} outside your hours`}
              tone="warning"
            />
          ) : null}
          {already.length > 0 ? (
            <Notice
              text="These were outside your hours before this change. When you save, Duna lists them for your club's managers as needing cover too; they stay booked with you."
              title={`${already.length} booked ${already.length === 1 ? "session is" : "sessions are"} already outside your hours`}
              tone="info"
            />
          ) : null}
          {[...newly, ...already].map((session) => (
            <View
              accessibilityLabel={`${session.title}, ${sessionWhenWords(session, timeZone)}${session.venueName ? `, ${session.venueName}` : ""}${session.newlyOutside ? ", moved outside your hours by this change" : ", already outside your hours"}`}
              accessible
              key={session.id}
              style={styles.conflict}
              testID={`conflict-${session.id}`}
            >
              <Icon
                name="schedule"
                size="inline"
                tone={session.newlyOutside ? "warning" : "text-2"}
              />
              <View style={styles.flex}>
                <Text variant="phone-body" weight={600}>
                  {session.title}
                </Text>
                <Text tone="text-2" variant="phone-meta">
                  {[
                    sessionWhenWords(session, timeZone),
                    session.venueName,
                    session.newlyOutside ? undefined : "already outside",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/**
 * Review and save: what the week becomes, when it takes effect, and the
 * booked sessions it affects. Single-submit; a two-step "start on a date"
 * remembers the draft it made, so a retry never makes a second one.
 */
function SaveSheet({
  visible,
  onClose,
  onSaved,
  team,
  target,
  schedule,
  blocks,
  conflicts,
  nextSentence,
  data,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSaved: (result: {
    readonly target?: Target;
    readonly toast: { text: string; undo?: () => void };
  }) => void;
  readonly team: MyTeam;
  readonly target: Target | null;
  readonly schedule: ScheduleOut | undefined;
  readonly blocks: readonly WeekBlock[];
  readonly conflicts: readonly SessionConflict[];
  readonly nextSentence: string;
  readonly data: AvailabilityData;
}) {
  const created = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) created.current = null;
  }, [visible]);
  const result = useRef<{
    target?: Target;
    toast: { text: string; undo?: () => void };
  } | null>(null);
  if (!target) return null;
  const windows = windowsFromBlocks(blocks);
  const isNew = target.kind === "new";
  const draft = schedule?.status === "draft";
  const when = isNew
    ? `From ${dayMonth(target.effectiveFrom)}`
    : draft
      ? "Not yet: this is a draft"
      : "Now";
  return (
    <ConfirmSheet
      description={nextSentence}
      event="pro.availability.save_failed"
      onClose={onClose}
      onDone={() => {
        if (result.current) onSaved(result.current);
        result.current = null;
      }}
      perform={async () => {
        if (target.kind === "new") {
          if (!created.current) {
            const saved = await data.writes.upsertSchedule({
              name: target.name,
              effectiveFrom: target.effectiveFrom,
              timezone: team.timeZone,
              windows,
            });
            created.current = saved.id;
          }
          const started = await data.writes.transitionSchedule(
            created.current,
            "active",
          );
          result.current = {
            target: { kind: "existing", scheduleId: started.id },
            toast: {
              text: `${target.name} starts ${target.effectiveFrom <= localDateOf(Date.now(), team.timeZone) ? "today" : `on ${dayMonth(target.effectiveFrom)}`}.`,
            },
          };
          return;
        }
        if (!schedule) throw new Error("This schedule was not found.");
        const before = schedule;
        await data.writes.upsertSchedule({
          scheduleId: schedule.id,
          name: schedule.name,
          effectiveFrom: schedule.effectiveFrom,
          ...(schedule.effectiveTo
            ? { effectiveTo: schedule.effectiveTo }
            : {}),
          timezone: schedule.timezone,
          windows,
        });
        const undoable = conflicts.length === 0;
        result.current = {
          toast: {
            text: "Your week is saved.",
            ...(undoable
              ? {
                  undo: () => {
                    void data.writes
                      .upsertSchedule({
                        scheduleId: before.id,
                        name: before.name,
                        effectiveFrom: before.effectiveFrom,
                        ...(before.effectiveTo
                          ? { effectiveTo: before.effectiveTo }
                          : {}),
                        timezone: before.timezone,
                        windows: windowsFromBlocks(
                          blocksFromWindows(before.windows),
                        ),
                      })
                      .catch(() => undefined);
                  },
                }
              : {}),
          },
        };
      }}
      rows={[
        {
          label: "Schedule",
          value: isNew ? target.name : (schedule?.name ?? ""),
        },
        { label: "Takes effect", value: when },
        {
          label: "Booked sessions",
          value:
            conflicts.length === 0
              ? "None affected"
              : `${conflicts.length} outside your hours after this: they stay booked with you and are listed for your managers as needing cover`,
        },
      ]}
      testID="availability-save-sheet"
      tier={2}
      title={isNew ? `Start ${target.name}?` : "Save your week?"}
      verb={isNew ? `Start on ${dayMonth(target.effectiveFrom)}` : "Save week"}
      visible={visible}
    >
      {conflicts.length > 0 ? (
        <ConflictList conflicts={conflicts} timeZone={team.timeZone} />
      ) : null}
    </ConfirmSheet>
  );
}

/** Start using a draft: the earlier schedule ends the day before. */
function StartSheet({
  schedule,
  onClose,
  onDone,
  conflicts,
  data,
  team,
}: {
  readonly schedule: ScheduleOut | null;
  readonly onClose: () => void;
  readonly onDone: (text: string) => void;
  readonly conflicts: readonly SessionConflict[];
  readonly data: AvailabilityData;
  readonly team: MyTeam;
}) {
  return (
    <ConfirmSheet
      description={
        schedule
          ? `${schedule.name} takes over on ${dayMonth(schedule.effectiveFrom)}. A schedule still running then ends the day before.`
          : ""
      }
      event="pro.availability.start_failed"
      onClose={onClose}
      onDone={() =>
        schedule &&
        onDone(
          `${schedule.name} starts on ${dayMonth(schedule.effectiveFrom)}.`,
        )
      }
      perform={async () => {
        if (!schedule) return;
        await data.writes.transitionSchedule(schedule.id, "active");
      }}
      rows={[
        {
          label: "Booked sessions",
          value:
            conflicts.length === 0
              ? "None affected"
              : `${conflicts.length} outside these hours: they stay booked with you and are listed for your managers as needing cover`,
        },
      ]}
      testID="availability-start-sheet"
      tier={2}
      title={schedule ? `Start ${schedule.name}?` : "Start schedule?"}
      verb="Start using it"
      visible={schedule !== null}
    >
      {conflicts.length > 0 ? (
        <ConflictList conflicts={conflicts} timeZone={team.timeZone} />
      ) : null}
    </ConfirmSheet>
  );
}

/** "Winter term from 1 December": a name and the day it starts. */
function NewScheduleSheet({
  visible,
  onClose,
  onCreate,
  today,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onCreate: (name: string, effectiveFrom: string) => void;
  readonly team: MyTeam;
  readonly today: string;
}) {
  const { tokens } = useTheme();
  const [name, setName] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setName("");
      setFrom(null);
    }
  }, [visible]);
  const ready = name.trim().length > 0 && from !== null;
  return (
    <AdaptiveSheet
      accessibilityLabel="New schedule"
      kind="dialog"
      onClose={onClose}
      testID="new-schedule-sheet"
      visible={visible}
    >
      <View
        style={[styles.sheetHead, { paddingHorizontal: tokens.space["4"] }]}
      >
        <Text
          accessibilityRole="header"
          style={styles.flex}
          variant="phone-heading"
        >
          New schedule from a date
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["8"],
          gap: tokens.space["4"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text tone="text-2" variant="phone-body">
          For a new term or season. It starts with your current week; change any
          day before you save. Your current schedule stays in force until the
          day before.
        </Text>
        <View style={styles.field}>
          <Text variant="phone-meta" weight={600}>
            Name
          </Text>
          <DunaTextInput
            accessibilityLabel="Schedule name"
            maxLength={80}
            onChangeText={setName}
            placeholder="Winter term"
            testID="new-schedule-name"
            value={name}
          />
        </View>
        <View style={styles.field}>
          <Text variant="phone-meta" weight={600}>
            {from ? `Starts ${dayMonth(from)}` : "Starts"}
          </Text>
          <DayStrip
            count={120}
            countLabel={() => ""}
            label="First day of the schedule"
            onValueChange={setFrom}
            start={today}
            testID="new-schedule-from"
            today={today}
            value={from}
          />
        </View>
        <ActionButton
          disabled={!ready}
          hint={!ready ? "Give it a name and a first day" : undefined}
          kind="primary"
          label={
            from
              ? `Edit the week from ${dayMonth(from)}`
              : "Choose the first day"
          }
          onPress={() => from && onCreate(name.trim(), from)}
          testID="new-schedule-create"
        />
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  column: { flex: 1 },
  columns: { flex: 1, flexDirection: "row" },
  divider: { width: StyleSheet.hairlineWidth },
  block: { gap: 10 },
  after: { gap: 2, paddingTop: 4 },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    minHeight: 56,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    minHeight: 56,
  },
  dayName: { minWidth: 40 },
  pills: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  conflict: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  field: { gap: 6 },
});
