/**
 * Pro Today (M-R0, boards P02-Today and P03-TodayDark; owner: "the your
 * schedule/agenda needs layout to be improved a bit for our weather and light
 * as it's taking up too much space"): the day at a glance with ONE line of
 * conditions (never a card), up next with its state and who is coming, what
 * needs the coach, matches on the coach's courts (live ones in the Live
 * zone), later today, and the day-complete state. Every block has loading,
 * empty, error, offline and not-configured states.
 *
 * Arrangements come from `layout-plan.ts`: one column on iPhone and the
 * closed Duo; the day beside later-today on the open Duo and iPad at half
 * width; plus a third column for the courts on a full iPad; on the Duo
 * propped half-open, up next on the top pane and the quick actions below.
 */
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Rally,
  Rise,
  Text,
  Title,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { usePane } from "@duna/ui/native/layout";
import { countdownParts, formatCountdown } from "@duna/tideline-core";
import type { ReactNode } from "react";
import { useShell } from "../../app/ShellContext";
import { PreviewNotice, TopBar } from "../../app/TopBar";
import { actionColumnsFor, type DayArrangement } from "../../app/layout-plan";
import type { RouteKey } from "../../app/router";
import { Card, Row, SectionHead, StatusChip, usePaneEdges } from "../../app/ui";
import type { AgendaItem, DayModel } from "./day-model";
import {
  AgendaRow,
  BlockState,
  CourtMatchRow,
  DayConditionsLine,
} from "./parts";
import { useDay } from "./use-day";

/** The coach's quick actions (board P02-Today), in order. */
export const TODAY_ACTIONS: readonly {
  readonly route: RouteKey;
  readonly label: string;
  readonly icon: GlyphName;
  readonly hint: string;
}[] = [
  {
    route: "courtside",
    label: "Courtside",
    icon: "score",
    hint: "Score a match on your courts",
  },
  {
    route: "checkin",
    label: "Check in",
    icon: "pass",
    hint: "Scan passes and tickets",
  },
  {
    route: "getPaid",
    label: "Get paid",
    icon: "tap-to-pay",
    hint: "Collect in person or send a link",
  },
  {
    route: "messages",
    label: "Message",
    icon: "message",
    hint: "Players, guardians and groups",
  },
];

function useOpenEntry() {
  const shell = useShell();
  return (entryId: string) => shell.open("calendar", { entryId });
}

function TodayHead({ model }: { readonly model: DayModel }) {
  const shell = useShell();
  const day = useDay();
  return (
    <View style={styles.head}>
      <TopBar />
      <View style={styles.titleBlock}>
        <Title>Today</Title>
        <Text tone="text-2" variant="phone-meta">
          {[model.dateLine, model.conditions?.venueName]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <PreviewNotice />
      </View>
      <DayConditionsLine
        conditions={model.conditions}
        now={day.now}
        onPress={() => shell.openConditions(model.dateKey)}
      />
    </View>
  );
}

function focusChip(model: DayModel, now: number) {
  const focus = model.focus!;
  if (model.focusReason === "live")
    return {
      label: "On court now",
      tone: "live-ink",
      wash: "live-wash",
    } as const;
  if (model.focusReason === "just-ended")
    return {
      label: "Just ended",
      tone: "text-2",
      wash: "surface-sunken",
    } as const;
  const parts = countdownParts(focus.startsAt, now);
  return {
    label:
      parts.direction === "now"
        ? "Starting now"
        : `Up next · ${formatCountdown(parts)}`,
    tone: "text",
    wash: "surface-sunken",
  } as const;
}

function UpNextCard({
  model,
  large = false,
}: {
  readonly model: DayModel;
  readonly large?: boolean;
}) {
  const shell = useShell();
  const day = useDay();
  const openEntry = useOpenEntry();
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const focus = model.focus!;
  const chip = focusChip(model, day.now);
  const actions: readonly {
    readonly label: string;
    readonly icon: GlyphName;
    readonly onPress: () => void;
  }[] =
    model.focusReason === "just-ended"
      ? [
          {
            label: "Record notes",
            icon: "lesson",
            onPress: () => shell.open("notes", { entryId: focus.id }),
          },
          {
            label: "Mark attendance",
            icon: "check",
            onPress: () => openEntry(focus.id),
          },
        ]
      : model.focusReason === "live"
        ? [
            {
              label: "Check in",
              icon: "pass",
              onPress: () => shell.open("checkin"),
            },
            {
              label: "Open session",
              icon: "schedule",
              onPress: () => openEntry(focus.id),
            },
          ]
        : [
            {
              label: "Open session",
              icon: "schedule",
              onPress: () => openEntry(focus.id),
            },
            ...(focus.audienceKey
              ? [
                  {
                    label: "Message group",
                    icon: "message" as const,
                    onPress: () =>
                      shell.open("messages", {
                        audienceKey: focus.audienceKey ?? undefined,
                      }),
                  },
                ]
              : []),
          ];
  return (
    <Card
      style={[
        styles.focusCard,
        {
          borderColor:
            model.focusReason === "live" ? colors.live : colors["line-strong"],
        },
      ]}
      testID="today-up-next"
    >
      <View style={styles.focusTop}>
        <StatusChip label={chip.label} tone={chip.tone} wash={chip.wash} />
        {focus.needs.map((need) => (
          <StatusChip
            icon={need.kind === "minimum" ? "alert" : "check"}
            key={need.kind}
            label={need.label}
            tone={need.kind === "minimum" ? "warning" : "attention"}
            wash={need.kind === "minimum" ? "warning-wash" : "attention-wash"}
          />
        ))}
      </View>
      <View
        accessibilityLabel={`${chip.label}. ${focus.title}. ${focus.timeRange}. ${focus.place}. ${focus.coming ?? ""}`}
        accessible
        style={styles.focusBody}
      >
        <Text tabular variant={large ? "display-sm" : "figure-sm"} weight={600}>
          {focus.timeRange}
        </Text>
        <Text variant="phone-body" weight={600}>
          {focus.title}
        </Text>
        <Text tone="text-2" variant="phone-meta">
          {[focus.place, focus.coming].filter(Boolean).join(" · ")}
        </Text>
        {focus.people.length ? (
          <Text numberOfLines={2} tone="text-2" variant="phone-meta">
            {`With ${focus.people.slice(0, 4).join(", ")}${focus.people.length > 4 ? ` and ${focus.people.length - 4} more` : ""}`}
          </Text>
        ) : null}
      </View>
      <View style={styles.focusActions}>
        {actions.map((action, index) => (
          <Pressable
            accessibilityRole="button"
            key={action.label}
            onPress={() => {
              haptics.confirmed(1);
              action.onPress();
            }}
            style={({ pressed }) => [
              styles.focusButton,
              {
                borderRadius: tokens.radius.lg,
                backgroundColor:
                  index === 0 ? colors.action : colors["surface-sunken"],
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <Icon
              color={index === 0 ? colors["on-action"] : undefined}
              name={action.icon}
              size="inline"
            />
            <Text
              style={index === 0 ? { color: colors["on-action"] } : undefined}
              variant="phone-body"
              weight={600}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

/** Sessions ran and nothing is left: a quiet summary, readable in dark. */
function DayComplete({ model }: { readonly model: DayModel }) {
  const shell = useShell();
  const complete = model.complete!;
  return (
    <Card testID="today-day-complete">
      <View style={styles.completeHead}>
        <Icon name="check" tone="positive" />
        <Text variant="phone-heading">Day complete</Text>
      </View>
      <Text tone="text-2" variant="phone-body">
        {[
          `${complete.sessions} session${complete.sessions === 1 ? "" : "s"}`,
          `${complete.checkedIn} checked in`,
          complete.toMark
            ? `attendance to mark on ${complete.toMark}`
            : "attendance marked",
        ].join(" · ")}
      </Text>
      <Row
        icon="schedule"
        onPress={() => shell.dispatch({ type: "select-tab", tab: "schedule" })}
        summary="Tomorrow and the rest of the week"
        title="Plan ahead"
      />
    </Card>
  );
}

function UpNextBlock({
  model,
  large,
}: {
  readonly model: DayModel;
  readonly large?: boolean;
}) {
  const shell = useShell();
  if (model.focus)
    return (
      <Rise>
        <UpNextCard large={large} model={model} />
      </Rise>
    );
  if (model.complete) return <DayComplete model={model} />;
  return (
    <EmptyState
      action={{ label: "Create a session", onPress: shell.openCreate }}
      compact
      text="Lessons, clinics and bookings you coach show up here."
      title="Nothing on your schedule today"
    />
  );
}

function NeedsYou({ model }: { readonly model: DayModel }) {
  const shell = useShell();
  const day = useDay();
  const openEntry = useOpenEntry();
  if (!model.needsYou.length && day.atRiskStatus === "ready") return null;
  return (
    <View style={styles.block}>
      <SectionHead title="Needs you" />
      {model.needsYou.map((item) => (
        <Row
          icon={
            item.kind === "minimum"
              ? "users"
              : item.kind === "attendance"
                ? "check"
                : "pay"
          }
          key={item.id}
          onPress={() =>
            item.kind === "unpaid"
              ? shell.open("getPaid")
              : item.entryId
                ? openEntry(item.entryId)
                : undefined
          }
          summary={item.summary}
          testID={`needs-${item.id}`}
          title={item.title}
          trailing={<StatusChip label={item.action} tone="text" />}
        />
      ))}
      {day.atRiskStatus === "error" ? (
        <ErrorState
          compact
          onRetry={() => void day.refresh()}
          text="Sessions under their minimum could not load."
          title="Couldn't load group minimums"
        />
      ) : null}
      {day.atRiskStatus === "loading" ? (
        <LoadingState count={1} loading skeleton="row" />
      ) : null}
    </View>
  );
}

export function TodayActions({
  arrangement,
}: {
  readonly arrangement: DayArrangement;
}) {
  const shell = useShell();
  const pane = usePane();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const across = actionColumnsFor(pane.width, arrangement);
  return (
    <View
      accessibilityLabel="Quick actions"
      accessibilityRole="menu"
      style={styles.actions}
    >
      <Rally
        itemStyle={{ flexBasis: across === 4 ? "22%" : "46%", flexGrow: 1 }}
      >
        {TODAY_ACTIONS.map((action) => (
          <Pressable
            accessibilityHint={action.hint}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            key={action.route}
            onPress={() => {
              haptics.confirmed(1);
              shell.open(action.route);
            }}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderRadius: tokens.radius.xl,
              },
              pressed ? styles.pressed : null,
            ]}
            testID={`today-action-${action.route}`}
          >
            <Icon name={action.icon} size="control" />
            <Text variant="phone-body" weight={600}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </Rally>
    </View>
  );
}

export function OnCourt({ model }: { readonly model: DayModel }) {
  const shell = useShell();
  return (
    <View style={styles.block}>
      <SectionHead title="On your courts" />
      {model.matches.length ? (
        model.matches.map((match) => (
          <CourtMatchRow
            key={match.id}
            match={match}
            onPress={() => shell.open("courtside", { matchId: match.id })}
          />
        ))
      ) : (
        <EmptyState
          compact
          text="Hosted and event matches on your courts appear here."
          title="No matches today"
        />
      )}
    </View>
  );
}

export function LaterToday({
  items,
  title = "Later today",
}: {
  readonly items: readonly AgendaItem[];
  readonly title?: string;
}) {
  const shell = useShell();
  const openEntry = useOpenEntry();
  return (
    <View style={styles.block}>
      <SectionHead
        action="Schedule"
        onAction={() => shell.dispatch({ type: "select-tab", tab: "schedule" })}
        title={title}
      />
      {items.length ? (
        items.map((item) => (
          <AgendaRow
            item={item}
            key={item.id}
            onPress={() => openEntry(item.id)}
          />
        ))
      ) : (
        <Text tone="text-2" variant="phone-meta">
          Nothing else on your schedule today.
        </Text>
      )}
    </View>
  );
}

/** Pull to refresh, honest error and offline states, then the content. */
export function DayScroll({
  children,
  testID,
  what,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
  readonly what: string;
}) {
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const day = useDay();
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: edges.top + tokens.space["2"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + tokens.space["4"],
        paddingRight: edges.right + tokens.space["4"],
        gap: tokens.space["6"],
      }}
      refreshControl={
        <RefreshControl
          onRefresh={() => void day.refresh()}
          refreshing={day.refreshing}
          tintColor={colors["text-2"]}
        />
      }
      style={{ backgroundColor: colors.ground }}
      testID={testID}
    >
      <BlockState
        lastFreshAt={day.lastFreshAt}
        onRetry={() => void day.refresh()}
        reference={day.failure}
        status={day.status}
        what={what}
      />
      {children}
    </ScrollView>
  );
}

function useTodayModel(): {
  readonly model: DayModel;
  readonly loading: boolean;
} {
  const day = useDay();
  return { model: day.build(), loading: day.status === "loading" };
}

/** Today as the primary pane for an arrangement. */
export function TodayPrimary({
  arrangement,
}: {
  readonly arrangement: DayArrangement;
}) {
  const { model, loading } = useTodayModel();
  return (
    <DayScroll testID="today-primary" what="Today">
      <TodayHead model={model} />
      <LoadingState count={2} loading={loading} skeleton="card">
        <View style={styles.block}>
          <SectionHead
            title={model.focusReason === "live" ? "Now" : "Up next"}
          />
          <UpNextBlock model={model} />
        </View>
        <NeedsYou model={model} />
        <TodayActions arrangement={arrangement} />
        {arrangement === "stack" ? (
          <>
            {model.matches.length ? <OnCourt model={model} /> : null}
            {model.focus || model.later.length ? (
              <LaterToday items={model.later} />
            ) : null}
          </>
        ) : null}
      </LoadingState>
    </DayScroll>
  );
}

/** The second column: later today (and the courts unless they have a column). */
export function TodaySecondary({
  withCourts,
}: {
  readonly withCourts: boolean;
}) {
  const { model, loading } = useTodayModel();
  return (
    <DayScroll testID="today-secondary" what="Today">
      <LoadingState count={4} loading={loading} skeleton="row">
        <LaterToday items={model.later} />
        {withCourts ? <OnCourt model={model} /> : null}
      </LoadingState>
    </DayScroll>
  );
}

/** The third column on a full iPad: the courts. */
export function TodayInspector() {
  const { model } = useTodayModel();
  return (
    <DayScroll testID="today-inspector" what="Today">
      <OnCourt model={model} />
    </DayScroll>
  );
}

/** Half-open Duo, top pane: up next and the conditions, watched at a distance. */
export function TodayTabletopTop() {
  const { model } = useTodayModel();
  const shell = useShell();
  const day = useDay();
  const edges = usePaneEdges();
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingTop: edges.top,
        paddingHorizontal: tokens.space["6"],
        gap: tokens.space["3"],
      }}
      testID="today-tabletop-top"
    >
      <Title>Today</Title>
      <DayConditionsLine
        conditions={model.conditions}
        now={day.now}
        onPress={() => shell.openConditions(model.dateKey)}
      />
      <UpNextBlock large model={model} />
    </View>
  );
}

/** Half-open Duo, bottom pane: the quick actions, for touch. */
export function TodayTabletopBottom() {
  const edges = usePaneEdges();
  const { tokens } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        paddingBottom: edges.bottom + tokens.space["6"],
        paddingHorizontal: tokens.space["6"],
      }}
      testID="today-tabletop-bottom"
    >
      <TodayActions arrangement="tabletop" />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: 12 },
  titleBlock: { gap: 4 },
  block: { gap: 8 },
  focusCard: { borderWidth: 1 },
  focusTop: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  focusBody: { gap: 2 },
  focusActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  focusButton: {
    flexGrow: 1,
    flexBasis: "40%",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  completeHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: {
    flex: 1,
    minHeight: 72,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    justifyContent: "space-between",
  },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
});
