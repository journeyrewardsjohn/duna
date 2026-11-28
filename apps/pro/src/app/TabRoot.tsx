/**
 * One tab of the Pro shell (M-R0): a Title-led root (Today, Schedule, or a
 * hub) and the selected route, arranged by `layout-plan.ts` for the window
 * the tab has: pushed detail on iPhone and the closed Duo; side by side on
 * the open Duo and iPad (with a third column for the courts on a full
 * iPad); and on the Duo propped half-open, content on the top pane and
 * controls on the bottom pane.
 */
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  AdaptiveScaffold,
  FoldScaffold,
  Text,
  Title,
  useTheme,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { useEffect, useState, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { EarningsTabRoot } from "../features/earnings";
import { PeopleTabRoot, usePersonName } from "../features/people";
import { useProRuntime } from "../../runtime";
import {
  SchedulePrimary,
  ScheduleSecondary,
  ScheduleTabletopBottom,
  ScheduleTabletopTop,
  TodayInspector,
  TodayPrimary,
  TodaySecondary,
  TodayTabletopBottom,
  TodayTabletopTop,
} from "../features/today";
import { shellPlan } from "./layout-plan";
import {
  ROUTES,
  routesForTab,
  tabDefinition,
  tabTitle,
  type TabKey,
} from "./router";
import { SCREENS } from "./screens";
import { RouteEntryContext, useShell } from "./ShellContext";
import { PreviewNotice, TopBar } from "./TopBar";
import { visibleRoute, type RouteEntry, type ShellState } from "./shell-state";
import { Row, SideBySideContext, usePaneEdges } from "./ui";

/** The header over a route: Back (one pane at a time) and the route's title. */
export function RouteHeader({
  title,
  backLabel,
  onBack,
}: {
  readonly title: string;
  readonly backLabel?: string;
  readonly onBack?: () => void;
}) {
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  return (
    <View
      style={{
        paddingTop: edges.top + tokens.space["2"],
        paddingLeft: edges.left + tokens.space["4"],
        paddingRight: edges.right + tokens.space["4"],
        paddingBottom: tokens.space["2"],
        backgroundColor: colors.ground,
        borderBottomColor: colors.line,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: tokens.space["1"],
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityHint={`Returns to ${backLabel ?? "the list"}`}
          accessibilityLabel={`Back to ${backLabel ?? "the list"}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.back}
          testID="route-back"
        >
          <Text tone="link" variant="phone-body" weight={600}>
            {`‹ ${backLabel ?? "Back"}`}
          </Text>
        </Pressable>
      ) : null}
      <Title size={24}>{title}</Title>
    </View>
  );
}

/** A route inside its tab: the new header over the route's screen. */
function RouteStack({
  entry,
  tab,
  showBack,
}: {
  readonly entry: RouteEntry;
  readonly tab: TabKey;
  readonly showBack: boolean;
}) {
  const shell = useShell();
  const { refresh } = useProRuntime();
  const edges = usePaneEdges();
  const definition = ROUTES[entry.key];
  const personName = usePersonName(
    entry.key === "people" ? entry.personId : undefined,
  );
  return (
    <View style={styles.fill} testID={`route-${entry.key}`}>
      <RouteHeader
        backLabel={tabTitle(tab, shell.audience)}
        onBack={showBack ? () => shell.back(tab) : undefined}
        title={personName ?? definition.title}
      />
      {/* A nested provider: the legacy screen's own safe-area views measure
          from below the header, so nothing is padded twice. */}
      {/* Legacy screens do not read side insets: keep them clear of the
          Duo's trailing bar and the iPad sidebar here. */}
      <View
        style={[
          styles.fill,
          { paddingLeft: edges.left, paddingRight: edges.right },
        ]}
      >
        <SafeAreaProvider style={styles.fill}>
          <RouteEntryContext.Provider value={entry}>
            {SCREENS[entry.key](entry, { shell, refresh, tab })}
          </RouteEntryContext.Provider>
        </SafeAreaProvider>
      </View>
    </View>
  );
}

/** A hub tab's root: the top bar, one Jost title, and its routes as rows. */
function TabHub({
  tab,
  selected,
}: {
  readonly tab: TabKey;
  readonly selected: RouteEntry | null;
}) {
  const shell = useShell();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const definition = tabDefinition(tab);
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: edges.top + tokens.space["2"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + tokens.space["4"],
        paddingRight: edges.right + tokens.space["4"],
        gap: tokens.space["2"],
      }}
      style={{ backgroundColor: colors.ground }}
      testID={`hub-${tab}`}
    >
      <TopBar />
      <View style={styles.hubHead}>
        <Title>{tabTitle(tab, shell.audience)}</Title>
        <Text tone="text-2" variant="phone-meta">
          {definition.summary}
        </Text>
        <PreviewNotice />
      </View>
      {routesForTab(tab).map((key) => (
        <Row
          icon={ROUTES[key].icon}
          key={key}
          onPress={() => shell.open(key)}
          selected={selected?.key === key}
          summary={ROUTES[key].summary}
          testID={`hub-row-${key}`}
          title={ROUTES[key].title}
        />
      ))}
    </ScrollView>
  );
}

export function TabRoot({
  tab,
  state,
  onTabletopChange,
}: {
  readonly tab: TabKey;
  readonly state: ShellState;
  readonly onTabletopChange: (active: boolean) => void;
}) {
  const region = useRegionLayout();
  const plan = shellPlan(region.layout);
  const { colors } = useTheme();
  const selected = state.stacks[tab];
  // A tab's default detail mounts only once the person has opened the tab,
  // so nothing behind an unvisited tab starts loading at launch.
  const [visited, setVisited] = useState(state.tab === tab);
  useEffect(() => {
    if (state.tab === tab) setVisited(true);
  }, [state.tab, tab]);
  const shown = visibleRoute(state, tab, plan.sideBySide && visited ? 2 : 1);
  const detail: ReactNode =
    shown && ROUTES[shown.key].presentation === "pane" ? (
      <RouteStack entry={shown} showBack={plan.showBack} tab={tab} />
    ) : null;

  let content: ReactNode;
  const day = tab === "today" || tab === "schedule";
  if (day && plan.day === "tabletop" && !selected) {
    content = (
      <FoldScaffold
        layout={region.layout}
        onTabletopChange={onTabletopChange}
        primary={
          tab === "today" ? <TodayTabletopTop /> : <ScheduleTabletopTop />
        }
        secondary={
          tab === "today" ? <TodayTabletopBottom /> : <ScheduleTabletopBottom />
        }
      />
    );
  } else if (tab === "today") {
    content = (
      <AdaptiveScaffold
        detail={detail}
        emptyDetail={
          plan.sideBySide ? (
            <TodaySecondary withCourts={!plan.courtsInInspector} />
          ) : null
        }
        inspector={plan.courtsInInspector ? <TodayInspector /> : undefined}
        layout={region.layout}
        primary={<TodayPrimary arrangement={plan.day} />}
      />
    );
  } else if (tab === "schedule") {
    content = (
      <AdaptiveScaffold
        detail={detail}
        emptyDetail={plan.sideBySide ? <ScheduleSecondary /> : null}
        layout={region.layout}
        primary={<SchedulePrimary withAside={plan.sideBySide} />}
      />
    );
  } else if (tab === "people") {
    content = (
      <PeopleTabRoot
        detail={detail}
        layout={region.layout}
        selectedPersonId={shown?.key === "people" ? shown.personId : undefined}
        sideBySide={plan.sideBySide}
      />
    );
  } else if (tab === "money") {
    content = (
      <EarningsTabRoot
        detail={detail}
        layout={region.layout}
        sideBySide={plan.sideBySide}
      />
    );
  } else {
    content = (
      <AdaptiveScaffold
        detail={detail}
        layout={region.layout}
        primary={<TabHub selected={shown} tab={tab} />}
      />
    );
  }

  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID={`tab-${tab}`}
    >
      <SideBySideContext.Provider value={plan.sideBySide}>
        {content}
      </SideBySideContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  hubHead: { gap: 4, paddingBottom: 12, paddingTop: 4 },
});
