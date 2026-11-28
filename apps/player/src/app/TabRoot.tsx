/**
 * One tab of the Player shell (M-P0): a Title-led hub (Home on Play) and the
 * selected route, arranged by `layout-plan.ts` for the window the tab has:
 * pushed detail on iPhone and the closed Duo, side by side on the open Duo
 * and iPad (with a third column on a full iPad), and on the Duo propped
 * half-open, content on the top pane and controls on the bottom pane.
 */
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  AdaptiveScaffold,
  FoldScaffold,
  Text,
  ThemeOverride,
  Title,
  useTheme,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { useContext, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { usePlayerRuntime } from "../../runtime";
import { VideoStudioScreen } from "../../video-studio";
import type { DiscoverIntentKind } from "../features/discovery/discover-intent";
import {
  HomePrimary,
  HomeInspector,
  HomeSecondary,
  HomeTabletopBottom,
  HomeTabletopTop,
} from "../features/home/HomeScreen";
import { shellPlan } from "./layout-plan";
import {
  ROUTES,
  routesForTab,
  tabDefinition,
  type RouteKey,
  type TabKey,
} from "./router";
import { SCREENS } from "./screens";
import { RouteEntryContext, ShellContext, useShell } from "./ShellContext";
import { ShellStatus } from "./ShellStatus";
import {
  isRouteActive,
  visibleRoute,
  type RouteEntry,
  type ShellState,
} from "./shell-state";
import { Row, SideBySideContext, usePaneEdges } from "./ui";

/** Find's shortcuts into search, beside its routes (board P-IA, "Find"). */
const FIND_SHORTCUTS: readonly {
  readonly intent: DiscoverIntentKind;
  readonly title: string;
  readonly summary: string;
  readonly icon: "ball" | "court" | "tournament" | "media-play";
}[] = [
  {
    intent: "find-match",
    title: "Find a game",
    summary: "Open matches at your level",
    icon: "ball",
  },
  {
    intent: "book-court",
    title: "Book a court",
    summary: "Live court availability",
    icon: "court",
  },
  {
    intent: "join-event",
    title: "Events",
    summary: "Tournaments, clinics and leagues",
    icon: "tournament",
  },
  {
    intent: "watch-pros",
    title: "Watch the pros",
    summary: "Live coverage and pro matches",
    icon: "media-play",
  },
];

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
        paddingTop: edges.top + tokens.space["1"],
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
  const definition = ROUTES[entry.key];
  const body = (
    <View style={styles.fill}>
      <RouteHeader
        backLabel={tabDefinition(tab).title}
        onBack={showBack ? () => shell.back(tab) : undefined}
        title={definition.title}
      />
      {/* A nested provider: the legacy screen's own safe-area views measure
          from below the header, so nothing is padded twice. */}
      <SafeAreaProvider style={styles.fill}>
        <RouteEntryContext.Provider value={entry}>
          {SCREENS[entry.key](entry, shell)}
        </RouteEntryContext.Provider>
      </SafeAreaProvider>
    </View>
  );
  // Legacy screens are drawn for the light palette only; they stay light
  // inside the shell until their package rebuilds them.
  return definition.legacy ? (
    <ThemeOverride theme="light">{body}</ThemeOverride>
  ) : (
    body
  );
}

/** A tab's hub: one Jost title, its status, and its routes as rows. */
function TabHub({
  tab,
  selected,
}: {
  readonly tab: TabKey;
  readonly selected: RouteEntry | null;
}) {
  const shell = useShell();
  const edges = usePaneEdges();
  const sideBySide = useContext(SideBySideContext);
  const { colors, tokens } = useTheme();
  const definition = tabDefinition(tab);
  const isSelected = (key: RouteKey, intent?: DiscoverIntentKind) =>
    sideBySide &&
    selected?.key === key &&
    (intent === undefined || selected.intent === intent);
  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: edges.top + tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + tokens.space["2"],
        paddingRight: edges.right + tokens.space["2"],
        gap: tokens.space["1"],
      }}
      style={{ backgroundColor: colors.ground }}
      testID={`hub-${tab}`}
    >
      <View style={[styles.hubHead, { paddingHorizontal: tokens.space["2"] }]}>
        <Title>{definition.title}</Title>
        <Text tone="text-2" variant="phone-meta">
          {definition.summary}
        </Text>
        <ShellStatus />
      </View>
      {routesForTab(tab).map((key) => (
        <Row
          icon={ROUTES[key].icon}
          key={key}
          onPress={() => shell.open(key)}
          selected={
            isSelected(key) && !(key === "discover" && selected?.intent)
          }
          summary={ROUTES[key].summary}
          testID={`hub-row-${key}`}
          title={ROUTES[key].title}
        />
      ))}
      {tab === "find"
        ? FIND_SHORTCUTS.map((shortcut) => (
            <Row
              icon={shortcut.icon}
              key={shortcut.intent}
              onPress={() =>
                shell.open("discover", { intent: shortcut.intent })
              }
              selected={isSelected("discover", shortcut.intent)}
              summary={shortcut.summary}
              title={shortcut.title}
            />
          ))
        : null}
    </ScrollView>
  );
}

/** The film studio: mounted for the session, shown over its tab when open. */
function FilmLayer({ active }: { readonly active: boolean }) {
  const runtime = usePlayerRuntime();
  const shell = useShell();
  return (
    <View
      pointerEvents={active ? "auto" : "none"}
      style={[StyleSheet.absoluteFill, active ? null : styles.hidden]}
    >
      {active ? (
        <ThemeOverride theme="light">
          <RouteHeader
            backLabel="Improve"
            onBack={() => shell.back("improve")}
            title={ROUTES.video.title}
          />
        </ThemeOverride>
      ) : null}
      <View style={styles.fill}>
        <SafeAreaProvider style={styles.fill}>
          <VideoStudioScreen
            active={active}
            onCreateMatch={shell.createMatch}
            onTransferStatus={shell.onVideoTransfer}
            runtime={runtime}
            theme="light"
          />
        </SafeAreaProvider>
      </View>
    </View>
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
  const shell = useContext(ShellContext);
  const selected = state.stacks[tab];
  const shown = visibleRoute(state, tab, plan.sideBySide ? 2 : 1);
  const detail: ReactNode =
    shown && ROUTES[shown.key].presentation === "pane" ? (
      <RouteStack entry={shown} showBack={plan.showBack} tab={tab} />
    ) : null;

  let content: ReactNode;
  if (tab === "play" && plan.home === "tabletop" && !selected) {
    content = (
      <FoldScaffold
        layout={region.layout}
        onTabletopChange={onTabletopChange}
        primary={<HomeTabletopTop />}
        secondary={<HomeTabletopBottom />}
      />
    );
  } else if (tab === "play") {
    content = (
      <AdaptiveScaffold
        detail={detail}
        emptyDetail={
          plan.sideBySide ? (
            <HomeSecondary withGame={!plan.gameInInspector} />
          ) : null
        }
        inspector={plan.gameInInspector ? <HomeInspector /> : undefined}
        layout={region.layout}
        primary={<HomePrimary arrangement={plan.home} />}
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
      {tab === "improve" && shell ? (
        <FilmLayer active={isRouteActive(state, "video")} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { opacity: 0 },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  hubHead: { gap: 4, paddingBottom: 12 },
});
