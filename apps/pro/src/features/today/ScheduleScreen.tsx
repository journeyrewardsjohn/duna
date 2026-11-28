/**
 * Pro Schedule (M-R0, boards P04-Schedule, P04b-ScheduleByCourt,
 * P04c-ScheduleConditions): a week day strip, Agenda · By court · By coach,
 * the chosen day's conditions in one line (tap for the sheet), the agenda as
 * a time rail with each session's light, court, who is coming, its state and
 * what needs the coach, then the tools (full calendar, check-in, event
 * desk). A session opens in the calendar beside the agenda on the open Duo
 * and iPad, pushed on iPhone.
 */
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  EmptyState,
  Icon,
  LoadingState,
  Text,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { dayStrip, type StripDay } from "@duna/tideline-core";
import { useState } from "react";
import { AtRiskGroup, useOpenSession } from "../session";
import { useShell } from "../../app/ShellContext";
import { PreviewNotice, TopBar } from "../../app/TopBar";
import { ROUTES, type RouteKey } from "../../app/router";
import { Row, SectionHead, usePaneEdges } from "../../app/ui";
import { groupAgenda, type AgendaView, type DayModel } from "./day-model";
import { AgendaRow, DayConditionsLine } from "./parts";
import { DayScroll, OnCourt } from "./TodayScreen";
import { useDay } from "./use-day";

const VIEWS: readonly { readonly key: AgendaView; readonly label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "court", label: "By court" },
  { key: "coach", label: "By coach" },
];

const TOOLS: readonly RouteKey[] = [
  "calendar",
  "checkin",
  "events",
  "availability",
  "timeAway",
  "cover",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function useScheduleModel(): {
  readonly model: DayModel;
  readonly days: readonly StripDay[];
  readonly loading: boolean;
} {
  const day = useDay();
  const shell = useShell();
  const days = dayStrip({
    items: day.entries
      .filter(
        (entry) =>
          entry.sourceType !== "busy-block" &&
          entry.sourceType !== "operator-block",
      )
      .map((entry) => ({ startsAt: Date.parse(entry.startsAt) })),
    timeZone: day.timeZone,
    now: day.now,
    days: 7,
  }).days;
  const dateKey = shell.scheduleDate ?? days[0]?.date;
  return {
    model: day.build(dateKey),
    days,
    loading: day.status === "loading",
  };
}

/** The week as a row of days with counts; today is marked, empty days say so. */
function DayStrip({
  days,
  selected,
}: {
  readonly days: readonly StripDay[];
  readonly selected: string;
}) {
  const shell = useShell();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  return (
    <ScrollView
      accessibilityLabel="Day"
      accessibilityRole="tablist"
      contentContainerStyle={styles.strip}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.stripScroll}
    >
      {days.map((day) => {
        const active = day.date === selected;
        return (
          <Pressable
            accessibilityLabel={`${WEEKDAYS[day.weekday]} ${day.dayOfMonth}${day.isToday ? ", today" : ""}. ${day.isEmpty ? "Nothing scheduled" : `${day.count} session${day.count === 1 ? "" : "s"}`}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={day.date}
            onPress={() => {
              haptics.selection();
              shell.setScheduleDate(day.date);
            }}
            style={[
              styles.day,
              {
                borderRadius: tokens.radius.lg,
                backgroundColor: active ? colors.action : colors.surface,
                borderColor: active ? colors.action : colors.line,
              },
            ]}
            testID={`day-${day.date}`}
          >
            <Text
              maxFontSizeMultiplier={1.6}
              style={active ? { color: colors["on-action"] } : undefined}
              tone={active ? undefined : "text-2"}
              variant="phone-meta"
            >
              {day.isToday ? "Today" : WEEKDAYS[day.weekday]}
            </Text>
            <Text
              maxFontSizeMultiplier={1.6}
              style={active ? { color: colors["on-action"] } : undefined}
              tabular
              variant="phone-body"
              weight={600}
            >
              {String(day.dayOfMonth)}
            </Text>
            <Text
              maxFontSizeMultiplier={1.6}
              style={active ? { color: colors["on-action"] } : undefined}
              tabular
              tone={active ? undefined : "text-3"}
              variant="phone-meta"
            >
              {day.isEmpty ? "—" : String(day.count)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ViewSwitch({
  view,
  onChange,
}: {
  readonly view: AgendaView;
  readonly onChange: (view: AgendaView) => void;
}) {
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  // At the largest text sizes the three choices stack instead of breaking words.
  const stacked = useWindowDimensions().fontScale >= 1.6;
  return (
    <View
      accessibilityLabel="View"
      accessibilityRole="radiogroup"
      style={[
        styles.segments,
        stacked ? styles.segmentsStacked : null,
        {
          backgroundColor: colors["surface-sunken"],
          borderRadius: tokens.radius.lg,
        },
      ]}
    >
      {VIEWS.map((option) => {
        const selected = option.key === view;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            key={option.key}
            onPress={() => {
              haptics.selection();
              onChange(option.key);
            }}
            style={[
              styles.segment,
              stacked ? styles.segmentStacked : null,
              {
                borderRadius: tokens.radius.md,
                backgroundColor: selected ? colors.surface : "transparent",
              },
            ]}
            testID={`schedule-view-${option.key}`}
          >
            <Text variant="phone-meta" weight={selected ? 600 : 500}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Agenda({
  model,
  view,
}: {
  readonly model: DayModel;
  readonly view: AgendaView;
}) {
  const shell = useShell();
  const day = useDay();
  const openSession = useOpenSession();
  const sessions = model.sessionCount;
  return (
    <View style={styles.block}>
      <SectionHead title={model.dateLine} />
      <Text tone="text-2" variant="phone-meta">
        {sessions
          ? `${sessions} session${sessions === 1 ? "" : "s"} on your day`
          : "Nothing on your day"}
      </Text>
      <DayConditionsLine
        conditions={model.conditions}
        now={day.now}
        onPress={() => shell.openConditions(model.dateKey)}
      />
      {model.agenda.length ? (
        groupAgenda(model.agenda, view).map((group) => (
          <View key={group.key} style={styles.group}>
            {group.title ? (
              <View style={styles.groupHead}>
                <Text
                  accessibilityRole="header"
                  variant="phone-body"
                  weight={600}
                >
                  {group.title}
                </Text>
                {group.meta ? (
                  <Text tone="text-2" variant="phone-meta">
                    {group.meta}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {group.items.map((item) => (
              <AgendaRow
                item={item}
                key={`${group.key}-${item.id}`}
                onPress={() => openSession(item.id)}
                showCoach={view !== "coach"}
              />
            ))}
          </View>
        ))
      ) : (
        <EmptyState
          action={{ label: "Create a session", onPress: shell.openCreate }}
          compact
          text="Lessons, clinics, bookings and blocks appear here."
          title="A free day"
        />
      )}
    </View>
  );
}

function Tools() {
  const shell = useShell();
  return (
    <View style={styles.block}>
      <SectionHead title="Tools" />
      {TOOLS.map((key) => (
        <Row
          icon={ROUTES[key].icon}
          key={key}
          onPress={() => shell.open(key)}
          summary={ROUTES[key].summary}
          testID={`schedule-tool-${key}`}
          title={ROUTES[key].title}
        />
      ))}
    </View>
  );
}

function ScheduleHead({
  days,
  selected,
}: {
  readonly days: readonly StripDay[];
  readonly selected: string;
}) {
  const day = useDay();
  return (
    <View style={styles.head}>
      <TopBar />
      <View style={styles.titleBlock}>
        <Title>Schedule</Title>
        <Text tone="text-2" variant="phone-meta">
          {new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: day.timeZone,
          }).format(new Date(day.now))}
        </Text>
        <PreviewNotice />
      </View>
      <DayStrip days={days} selected={selected} />
    </View>
  );
}

/** Schedule as the primary pane for an arrangement. */
export function SchedulePrimary({
  withAside,
}: {
  readonly withAside: boolean;
}) {
  const { model, days, loading } = useScheduleModel();
  const [view, setView] = useState<AgendaView>("agenda");
  return (
    <DayScroll testID="schedule-primary" what="Your schedule">
      <ScheduleHead days={days} selected={model.dateKey} />
      <AtRiskGroup testID="schedule-at-risk" />
      <ViewSwitch onChange={setView} view={view} />
      <LoadingState count={4} loading={loading} skeleton="row">
        <Agenda model={model} view={view} />
        {withAside ? null : (
          <>
            {model.matches.length ? <OnCourt model={model} /> : null}
            <Tools />
          </>
        )}
      </LoadingState>
    </DayScroll>
  );
}

/** The second column before a session is chosen: courts and tools. */
export function ScheduleSecondary() {
  const { model } = useScheduleModel();
  return (
    <DayScroll testID="schedule-secondary" what="Your schedule">
      <OnCourt model={model} />
      <Tools />
    </DayScroll>
  );
}

/** Half-open Duo, top pane: the day's agenda, read at a distance. */
export function ScheduleTabletopTop() {
  const { model } = useScheduleModel();
  const edges = usePaneEdges();
  const { tokens } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: edges.top + tokens.space["2"],
        paddingHorizontal: tokens.space["6"],
        paddingBottom: tokens.space["4"],
        gap: tokens.space["3"],
      }}
      testID="schedule-tabletop-top"
    >
      <Title>Schedule</Title>
      <Agenda model={model} view="agenda" />
    </ScrollView>
  );
}

/** Half-open Duo, bottom pane: the day strip and the tools, for touch. */
export function ScheduleTabletopBottom() {
  const { model, days } = useScheduleModel();
  const shell = useShell();
  const haptics = useHaptics();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingBottom: edges.bottom + tokens.space["4"],
        paddingHorizontal: tokens.space["6"],
        gap: tokens.space["3"],
      }}
      testID="schedule-tabletop-bottom"
    >
      <DayStrip days={days} selected={model.dateKey} />
      <View style={styles.toolRow}>
        {TOOLS.map((key) => (
          <Pressable
            accessibilityHint={ROUTES[key].summary}
            accessibilityLabel={ROUTES[key].title}
            accessibilityRole="button"
            key={key}
            onPress={() => {
              haptics.confirmed(0);
              shell.open(key);
            }}
            style={({ pressed }) => [
              styles.toolButton,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderRadius: tokens.radius.lg,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Icon name={ROUTES[key].icon} size="inline" />
            <Text variant="phone-body" weight={600}>
              {ROUTES[key].title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 12 },
  titleBlock: { gap: 4 },
  block: { gap: 8 },
  group: { gap: 2 },
  groupHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 8,
  },
  strip: { gap: 8, paddingVertical: 2 },
  day: {
    minWidth: 56,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  segments: { flexDirection: "row", padding: 4, gap: 4 },
  segmentsStacked: { flexDirection: "column" },
  segmentStacked: { flex: 0, paddingVertical: 6 },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  toolRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolButton: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stripScroll: { flexGrow: 0 },
});
