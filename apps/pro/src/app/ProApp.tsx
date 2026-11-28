/**
 * The Duna Pro shell (M-R0): the system tab bar through `NavigationChrome`
 * with the coach tabs (Today · Schedule · Students · Threads · Earnings; an
 * owner sees People · Inbox · Money), one `TabRoot` per tab, the Create
 * sheet and the conditions sheet, and whole-window routes (Courtside,
 * check-in, Messages, Ask Duna, Create, Get paid, film, notes, the event
 * desk). Navigation state lives in `shell-state.ts`; routes in `router.ts`;
 * renderers in `screens.tsx`; links in `deep-links.ts`.
 */
import { AppState, Linking, StyleSheet, View } from "react-native";
import { DevicePostureProvider } from "@duna/expo-device-posture";
import {
  LiveZone,
  NavigationChrome,
  ThemeOverride,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DunaAiScreen } from "../../duna-ai-screen";
import { listenForMessagingNotificationResponses } from "../../messaging-notifications";
import { useProRuntime } from "../../runtime";
import { devLaunchUrl } from "../features/dev/dev-launch";
import {
  ProFoundations,
  foundationsAutostart,
  parseFoundationsUrl,
  type FoundationsOptions,
} from "../features/dev/Foundations";
import { ProLayoutLab, layoutLabAutostart } from "../features/dev/LayoutLab";
import { ConditionsSheet, DayProvider, useDay } from "../features/today";
import { darkStyles, lightStyles, setActiveStyles } from "../legacy/styles";
import { darkColors, lightColors, setActivePalette } from "../shared/palette";
import {
  deepLinkNavigation,
  organizationSlug,
  parseDevShellUrl,
  parseProDeepLink,
} from "./deep-links";
import { NewSheet } from "./NewSheet";
import { ROUTES, TABS, audienceForRole, tabTitle, type TabKey } from "./router";
import { askDunaPalette, SCREENS } from "./screens";
import { ShellContext, type ShellNavigation } from "./ShellContext";
import { initialShellState, shellReducer } from "./shell-state";
import { TabRoot } from "./TabRoot";

/** The conditions sheet for the day the shell asked about. */
function ShellConditions({
  dateKey,
  onClose,
}: {
  readonly dateKey: string | null | undefined;
  readonly onClose: () => void;
}) {
  const day = useDay();
  const model = dateKey === undefined ? null : day.build(dateKey ?? undefined);
  return (
    <ConditionsSheet
      conditions={model?.conditions ?? null}
      onClose={onClose}
      visible={dateKey !== undefined}
    />
  );
}

export function ProApp() {
  const runtime = useProRuntime();
  const {
    activeAuthOrganizationId,
    authOrganizations,
    client,
    messagingDelivery,
    mode,
    refresh,
    switchOrganization,
  } = runtime;
  const haptics = useHaptics();
  const { colors: themeColors, scheme, statusBar, setPreference } = useTheme();
  const setPreferenceRef = useRef(setPreference);
  setPreferenceRef.current = setPreference;
  const [state, dispatch] = useReducer(shellReducer, undefined, () =>
    initialShellState(),
  );
  const [tabletop, setTabletop] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  // undefined: closed; null: today; a key: that day.
  const [conditionsDate, setConditionsDate] = useState<
    string | null | undefined
  >(undefined);
  const [layoutLabOpen, setLayoutLabOpen] = useState(
    Boolean(layoutLabAutostart),
  );
  const [foundations, setFoundations] = useState<FoundationsOptions | null>(
    foundationsAutostart,
  );
  const mountedAt = useRef(Date.now());
  const previewRef = useRef(mode === "preview");
  previewRef.current = mode === "preview";
  const organizationsRef = useRef({
    authOrganizations,
    activeAuthOrganizationId,
    switchOrganization,
    refresh,
  });
  organizationsRef.current = {
    authOrganizations,
    activeAuthOrganizationId,
    switchOrganization,
    refresh,
  };

  const windowRoute = state.window?.entry;
  // Legacy screens read a module-level palette; it follows the appearance,
  // except Courtside and check-in, which are always the Live zone.
  const legacyDark =
    windowRoute && ROUTES[windowRoute.key].live ? true : scheme === "dark";
  setActivePalette(legacyDark ? darkColors : lightColors);
  setActiveStyles(legacyDark ? darkStyles : lightStyles);

  const audience = audienceForRole(
    authOrganizations?.find(
      (organization) => organization.id === activeAuthOrganizationId,
    )?.role,
  );

  // Every Pro link resolves to a place in the shell (deep-links.test.ts).
  useEffect(() => {
    const openLink = (url: string | null) => {
      const foundationsLink = parseFoundationsUrl(url);
      if (foundationsLink) {
        if (previewRef.current) setFoundations(foundationsLink);
        return;
      }
      if (url?.startsWith("duna-pro://dev/layout-lab")) {
        if (previewRef.current) setLayoutLabOpen(true);
        return;
      }
      const devShell = parseDevShellUrl(url);
      if (devShell) {
        if (!previewRef.current) return;
        if (devShell.theme) setPreferenceRef.current(devShell.theme);
        for (const action of devShell.actions) dispatch(action);
        if (devShell.conditions) setConditionsDate(null);
        return;
      }
      const link = parseProDeepLink(url);
      if (!link) return;
      dispatch(deepLinkNavigation(link));
      if (link.kind !== "organization") return;
      const current = organizationsRef.current;
      const target = current.authOrganizations?.find(
        (organization) => organizationSlug(organization.name) === link.slug,
      );
      if (
        target &&
        target.id !== current.activeAuthOrganizationId &&
        current.switchOrganization
      ) {
        void current.switchOrganization(target.id);
      } else {
        void current.refresh();
      }
    };
    void Linking.getInitialURL().then((url) => openLink(url ?? devLaunchUrl()));
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openLink(url),
    );
    return () => subscription.remove();
  }, []);

  useEffect(
    () =>
      listenForMessagingNotificationResponses(() => {
        void messagingDelivery?.syncAll().catch(() => undefined);
      }),
    [messagingDelivery],
  );

  // Unread conversations badge the inbox tab (live builds).
  useEffect(() => {
    if (mode !== "live" || !client) return;
    const refreshUnread = () =>
      client.messaging.inbox
        .query({ asPrincipal: "organization" })
        .then((inbox) => setUnreadMessages(inbox.totalUnread))
        .catch(() => undefined);
    void refreshUnread();
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshUnread();
    });
    const interval = setInterval(() => void refreshUnread(), 30_000);
    return () => {
      appState.remove();
      clearInterval(interval);
    };
  }, [client, mode]);

  const openCreate = useCallback(() => {
    haptics.confirmed(1);
    dispatch({ type: "open-sheet" });
  }, [haptics]);

  const shell = useMemo<ShellNavigation>(
    () => ({
      dispatch,
      open: (route, params) => dispatch({ type: "open", route, ...params }),
      back: (tab: TabKey) => dispatch({ type: "back", tab }),
      closeWindow: () => dispatch({ type: "close-window" }),
      openCreate,
      openConditions: (dateKey) => setConditionsDate(dateKey ?? null),
      scheduleDate,
      setScheduleDate,
      audience,
      unreadMessages,
      openLayoutLab: () => {
        if (previewRef.current) setLayoutLabOpen(true);
      },
    }),
    [audience, openCreate, scheduleDate, unreadMessages],
  );

  const windowTab = state.window?.from ?? state.tab;
  const dayTab = state.tab === "today" || state.tab === "schedule";
  const windowContent =
    windowRoute && windowRoute.key !== "ai"
      ? SCREENS[windowRoute.key](windowRoute, {
          shell,
          refresh,
          tab: windowTab,
        })
      : null;

  return (
    <DevicePostureProvider>
      <ShellContext.Provider value={shell}>
        <DayProvider>
          <StatusBar
            style={
              windowRoute && ROUTES[windowRoute.key].live
                ? "light"
                : statusBar === "light"
                  ? "light"
                  : "dark"
            }
          />
          <View style={styles.fill}>
            <NavigationChrome
              hidden={
                (tabletop && dayTab && !state.stacks[state.tab]) ||
                Boolean(windowRoute)
              }
              onSelect={(key) => {
                // iPad's sidebar-adaptable tab bar reports its first tab once
                // while it mounts; that echo is not a person's choice.
                if (Date.now() - mountedAt.current < 1_500) return;
                haptics.selection();
                dispatch({ type: "select-tab", tab: key as TabKey });
              }}
              selected={state.tab}
              tabs={TABS.map((tab) => ({
                key: tab.key,
                title: tabTitle(tab.key, audience),
                systemImage: tab.systemImage,
                ...(tab.key === "inbox" && unreadMessages > 0
                  ? {
                      badge:
                        unreadMessages > 99 ? "99+" : String(unreadMessages),
                    }
                  : {}),
                content: (
                  <TabRoot
                    onTabletopChange={setTabletop}
                    state={state}
                    tab={tab.key}
                  />
                ),
              }))}
            />
            {windowContent ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  styles.window,
                  { backgroundColor: themeColors.ground },
                ]}
                testID={`window-${windowRoute?.key}`}
              >
                {windowRoute && ROUTES[windowRoute.key].live ? (
                  <LiveZone>
                    <SafeAreaProvider style={styles.fill}>
                      {windowContent}
                    </SafeAreaProvider>
                  </LiveZone>
                ) : (
                  <SafeAreaProvider style={styles.fill}>
                    {windowContent}
                  </SafeAreaProvider>
                )}
              </View>
            ) : null}
            {/* Ask Duna stays mounted so its conversation survives closing it. */}
            <View
              pointerEvents={windowRoute?.key === "ai" ? "auto" : "none"}
              style={[
                StyleSheet.absoluteFill,
                windowRoute?.key === "ai"
                  ? [styles.window, { backgroundColor: themeColors.ground }]
                  : styles.hidden,
              ]}
              testID="window-ai"
            >
              <ThemeOverride theme={legacyDark ? "dark" : "light"}>
                <DunaAiScreen
                  onClose={() => dispatch({ type: "close-window" })}
                  palette={askDunaPalette()}
                  pathname={`/${windowTab}`}
                />
              </ThemeOverride>
            </View>
            <NewSheet
              onClose={() => dispatch({ type: "close-sheet" })}
              onOpen={(route) => dispatch({ type: "open", route })}
              visible={state.sheet === "new"}
            />
            <ShellConditions
              dateKey={conditionsDate}
              onClose={() => setConditionsDate(undefined)}
            />
          </View>
        </DayProvider>
      </ShellContext.Provider>
      {layoutLabOpen && mode === "preview" ? (
        <ProLayoutLab onClose={() => setLayoutLabOpen(false)} />
      ) : null}
      {foundations && mode === "preview" ? (
        <ProFoundations
          initial={foundations}
          onClose={() => setFoundations(null)}
        />
      ) : null}
    </DevicePostureProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  window: { zIndex: 10 },
  hidden: { opacity: 0 },
});
