import { useProRuntime } from "../../runtime";
import { useColorScheme, Animated, Linking, Easing, View } from "react-native";
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@duna/ui/native/theme";
import { listenForMessagingNotificationResponses } from "../../messaging-notifications";
import { SessionNotesScreen } from "../../session-notes";
import { DunaAiScreen } from "../../duna-ai-screen";
import { OperatorCreateScreen } from "../../operator-create";
import { GetPaidScreen } from "../../get-paid";
import { MoneyScreen } from "../../money-screen";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ProMessagingScreen } from "../../messaging-screen";
import { TicketScannerScreen } from "../../ticket-scanner";
import { TournamentControl } from "../../tournament-control";
import { CoachVideoScreen } from "../../coach-video";
import {
  setActivePalette,
  darkColors,
  lightColors,
  colors,
  rgba,
  type ThemeName,
  type ThemePreference,
} from "../shared/palette";
import { useReducedMotion } from "../shared/use-reduced-motion";
import { type Tab, type NavDestination } from "./navigation";
import { type ProCalendarEntry } from "../features/calendar";
import {
  setActiveStyles,
  darkStyles,
  lightStyles,
  styles,
} from "../legacy/styles";
import { OpenDunaAiContext, ThemeContext } from "../shared/theme-context";
import { ScorerScreen } from "../features/courtside";
import { PreviewBanner } from "./PreviewBanner";
import { TodayScreen } from "../features/today";
import { CalendarScreen } from "../features/calendar";
import { PeopleScreen } from "../features/people";
import { MoreScreen } from "../features/more";
import { TabBar } from "./TabBar";
import { DevicePostureProvider } from "@duna/expo-device-posture";
import { ProLayoutLab, layoutLabAutostart } from "../features/dev/LayoutLab";
import { devLaunchUrl } from "../features/dev/dev-launch";
import {
  ProFoundations,
  foundationsAutostart,
  parseFoundationsUrl,
  type FoundationsOptions,
} from "../features/dev/Foundations";

export function ProApp() {
  const {
    activeAuthOrganizationId,
    authOrganizations,
    messagingDelivery,
    mode,
    refresh,
    switchOrganization,
  } = useProRuntime();
  const deviceTheme: ThemeName = useColorScheme() === "dark" ? "dark" : "light";
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("today");
  const [surface, setSurface] = useState<
    | "ai"
    | "create"
    | "get-paid"
    | "money"
    | "messages"
    | "scan"
    | "score"
    | "tournament"
    | "video"
  >();
  const [messagesConversationId, setMessagesConversationId] =
    useState<string>();
  const [messagesPersonId, setMessagesPersonId] = useState<string>();
  const [messagesAudienceKey, setMessagesAudienceKey] = useState<string>();
  const [sessionNotesId, setSessionNotesId] = useState<string>();
  const [sessionNotePersonId, setSessionNotePersonId] = useState<string>();
  const [scoreMatchId, setScoreMatchId] = useState<string>();
  const [calendarEntryId, setCalendarEntryId] = useState<string>();
  // The saved choice ("duna-theme": light, dark or system) lives in the
  // design system's ThemeProvider at the app root; it persists it too.
  const { preference: themePreference, setPreference: setThemePreference } =
    useTheme();
  const theme = themePreference === "system" ? deviceTheme : themePreference;
  // v3 ground inversion: operational browsing follows the chosen appearance,
  // while courtside scoring is always the rare, high-focus live ground.
  const surfaceTheme: ThemeName =
    surface === "score" || surface === "scan" ? "dark" : theme;
  const screenTransition = useRef(new Animated.Value(1)).current;
  // Development-only Layout lab: preview builds only, never production navigation.
  const [layoutLabOpen, setLayoutLabOpen] = useState(
    Boolean(layoutLabAutostart),
  );
  // Development-only Foundations gallery (preview builds only).
  const [foundations, setFoundations] = useState<FoundationsOptions | null>(
    foundationsAutostart,
  );
  const previewRef = useRef(mode === "preview");
  previewRef.current = mode === "preview";

  const openCalendar = (entryId?: string) => {
    setCalendarEntryId(entryId);
    setTab("calendar");
  };

  const openScore = (matchId?: string) => {
    setScoreMatchId(matchId);
    setSurface("score");
  };

  const openGroupMessaging = (entry: ProCalendarEntry) => {
    setMessagesConversationId(undefined);
    setMessagesPersonId(undefined);
    setMessagesAudienceKey(
      entry.sourceType === "booking"
        ? `rental:${entry.id}`
        : `event:${entry.id}`,
    );
    setSurface("messages");
  };

  const changeTab = (nextTab: NavDestination) => {
    if (nextTab === "ai" || nextTab === "create") {
      setSurface(nextTab);
      return;
    }
    if (nextTab === "calendar") setCalendarEntryId(undefined);
    setTab(nextTab);
  };

  useEffect(() => {
    const openActivity = (url: string | null) => {
      const foundationsLink = parseFoundationsUrl(url);
      if (foundationsLink) {
        if (previewRef.current) setFoundations(foundationsLink);
        return;
      }
      if (url?.startsWith("duna-pro://dev/layout-lab")) {
        if (previewRef.current) setLayoutLabOpen(true);
        return;
      }
      if (url?.startsWith("duna-pro://messages")) {
        const conversationId = url.match(
          /^duna-pro:\/\/messages\/([^/?#]+)/,
        )?.[1];
        setMessagesConversationId(
          conversationId ? decodeURIComponent(conversationId) : undefined,
        );
        setSurface("messages");
        return;
      }
      const matchScore = url?.match(/^duna-pro:\/\/match\/([^/?#]+)/);
      if (matchScore?.[1]) {
        setScoreMatchId(decodeURIComponent(matchScore[1]));
        setSurface("score");
        return;
      }
      const sessionMatch = url?.match(/^duna-pro:\/\/session\/([^/?#]+)/);
      if (sessionMatch?.[1]) {
        setSurface(undefined);
        setCalendarEntryId(decodeURIComponent(sessionMatch[1]));
        setTab("calendar");
        return;
      }
      const organizationMatch = url?.match(
        /^duna-pro:\/\/organization\/([^/?#]+)/,
      );
      if (!organizationMatch?.[1]) return;
      const slug = decodeURIComponent(organizationMatch[1]);
      const normalized = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      const target = authOrganizations?.find(
        (organization) => normalized(organization.name) === slug,
      );
      setSurface(undefined);
      setCalendarEntryId(undefined);
      setTab("today");
      if (
        target &&
        target.id !== activeAuthOrganizationId &&
        switchOrganization
      ) {
        void switchOrganization(target.id);
      } else {
        void refresh();
      }
    };
    void Linking.getInitialURL().then((url) =>
      openActivity(url ?? devLaunchUrl()),
    );
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openActivity(url),
    );
    return () => subscription.remove();
  }, [
    activeAuthOrganizationId,
    authOrganizations,
    refresh,
    switchOrganization,
  ]);

  useEffect(
    () =>
      listenForMessagingNotificationResponses(() => {
        void messagingDelivery?.syncAll().catch(() => undefined);
      }),
    [messagingDelivery],
  );

  useEffect(() => {
    if (reduceMotion) {
      screenTransition.setValue(1);
      return;
    }
    screenTransition.setValue(0);
    Animated.timing(screenTransition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, screenTransition, tab]);

  setActivePalette(surfaceTheme === "dark" ? darkColors : lightColors);
  setActiveStyles(surfaceTheme === "dark" ? darkStyles : lightStyles);

  const shell = (
    <OpenDunaAiContext.Provider value={() => setSurface("ai")}>
      <ThemeContext.Provider
        value={{
          theme,
          preference: themePreference,
          toggle: () => {
            const next: ThemePreference =
              themePreference === "system"
                ? "light"
                : themePreference === "light"
                  ? "dark"
                  : "system";
            setThemePreference(next);
          },
        }}
      >
        {sessionNotesId ? (
          <SessionNotesScreen
            initialPersonId={sessionNotePersonId}
            onClose={() => {
              setSessionNotesId(undefined);
              setSessionNotePersonId(undefined);
            }}
            onSaved={refresh}
            sessionId={sessionNotesId}
          />
        ) : surface === "ai" ? (
          <DunaAiScreen
            onClose={() => setSurface(undefined)}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              ink: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              warning: colors.warning,
              positive: colors.positive,
              danger: colors.danger,
              border: rgba(colors.overlayRgb, 0.12),
            }}
            pathname={`/${tab}`}
          />
        ) : surface === "create" ? (
          <OperatorCreateScreen
            onClose={() => setSurface(undefined)}
            onCreated={refresh}
            onGetPaid={() => setSurface("get-paid")}
          />
        ) : surface === "get-paid" ? (
          <GetPaidScreen
            onClose={() => setSurface(undefined)}
            onCreate={() => setSurface("create")}
          />
        ) : surface === "money" ? (
          <MoneyScreen
            onClose={() => setSurface(undefined)}
            onCollect={() => setSurface("get-paid")}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              border: rgba(colors.overlayRgb, 0.12),
              text: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              positive: colors.positive,
              warning: colors.warning,
              danger: colors.danger,
              navy: colors.navy,
            }}
          />
        ) : surface === "messages" ? (
          <SafeAreaView
            edges={["top", "left", "right", "bottom"]}
            style={styles.safe}
          >
            <StatusBar style={theme === "dark" ? "light" : "dark"} />
            <ProMessagingScreen
              initialAudienceKey={messagesAudienceKey}
              initialConversationId={messagesConversationId}
              initialPersonId={messagesPersonId}
              onClose={() => {
                setMessagesConversationId(undefined);
                setMessagesPersonId(undefined);
                setMessagesAudienceKey(undefined);
                setSurface(undefined);
              }}
              palette={{
                canvas: colors.canvas,
                surface: colors.depth,
                surfaceAlt: colors.navyLift,
                border: rgba(colors.overlayRgb, 0.12),
                text: colors.bone,
                muted: colors.muted,
                accent: colors.aqua,
                onAccent: colors.onAccent,
                positive: colors.positive,
                warning: colors.warning,
                danger: colors.danger,
              }}
            />
          </SafeAreaView>
        ) : surface === "scan" ? (
          <SafeAreaView
            edges={["top", "left", "right", "bottom"]}
            style={styles.safe}
          >
            <StatusBar style="light" />
            <TicketScannerScreen
              onClose={() => setSurface(undefined)}
              palette={{
                canvas: colors.canvas,
                surface: colors.depth,
                surfaceAlt: colors.navyLift,
                border: rgba(colors.overlayRgb, 0.12),
                text: colors.bone,
                muted: colors.muted,
                accent: colors.aqua,
                onAccent: colors.onAccent,
                positive: colors.positive,
                warning: colors.warning,
                danger: colors.danger,
                overlay: rgba(colors.inkRgb, 0.35),
              }}
            />
          </SafeAreaView>
        ) : surface === "score" ? (
          <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
            <StatusBar style="light" />
            <View style={styles.app}>
              <ScorerScreen
                initialMatchId={scoreMatchId}
                onExit={() => {
                  setScoreMatchId(undefined);
                  setSurface(undefined);
                }}
              />
            </View>
          </SafeAreaView>
        ) : surface === "tournament" ? (
          <TournamentControl
            onClose={() => setSurface(undefined)}
            onScore={openScore}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              ink: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              positive: colors.positive,
              warning: colors.warning,
              danger: colors.danger,
              border: rgba(colors.overlayRgb, 0.12),
            }}
          />
        ) : surface === "video" ? (
          <CoachVideoScreen
            onClose={() => setSurface(undefined)}
            palette={{
              canvas: colors.canvas,
              surface: colors.depth,
              surfaceAlt: colors.navyLift,
              ink: colors.bone,
              muted: colors.muted,
              accent: colors.aqua,
              onAccent: colors.onAccent,
              positive: colors.positive,
              warning: colors.warning,
              danger: colors.danger,
              border: rgba(colors.overlayRgb, 0.12),
            }}
          />
        ) : (
          <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
            <StatusBar style={theme === "dark" ? "light" : "dark"} />
            <View style={styles.app}>
              <PreviewBanner onOpenLayoutLab={() => setLayoutLabOpen(true)} />
              <Animated.View
                style={[
                  styles.animatedScreen,
                  {
                    opacity: screenTransition,
                    transform: [
                      {
                        translateY: screenTransition.interpolate({
                          inputRange: [0, 1],
                          outputRange: [8, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {tab === "today" && (
                  <TodayScreen
                    onCalendar={openCalendar}
                    onCreate={() => setSurface("create")}
                    onGetPaid={() => setSurface("get-paid")}
                    onMessageGroup={openGroupMessaging}
                    onPeople={() => setTab("people")}
                    onRecordNotes={(sessionId) => {
                      setSessionNotePersonId(undefined);
                      setSessionNotesId(sessionId);
                    }}
                    onScore={openScore}
                  />
                )}
                {tab === "calendar" && (
                  <CalendarScreen
                    focusEntryId={calendarEntryId}
                    onCreate={() => setSurface("create")}
                    onMessageGroup={openGroupMessaging}
                    onRecordNotes={(sessionId) => {
                      setSessionNotePersonId(undefined);
                      setSessionNotesId(sessionId);
                    }}
                    onScan={() => setSurface("scan")}
                    onScore={openScore}
                  />
                )}
                {tab === "people" && (
                  <PeopleScreen
                    onMessage={(personId) => {
                      setMessagesPersonId(personId);
                      setMessagesAudienceKey(undefined);
                      setMessagesConversationId(undefined);
                      setSurface("messages");
                    }}
                    onRecordNotes={(sessionId, personId) => {
                      setSessionNotePersonId(personId);
                      setSessionNotesId(sessionId);
                    }}
                  />
                )}
                {tab === "more" && (
                  <MoreScreen
                    onCalendar={() => openCalendar()}
                    onCreate={() => setSurface("create")}
                    onGetPaid={() => setSurface("get-paid")}
                    onMoney={() => setSurface("money")}
                    onMessages={() => {
                      setMessagesConversationId(undefined);
                      setMessagesPersonId(undefined);
                      setMessagesAudienceKey(undefined);
                      setSurface("messages");
                    }}
                    onPeople={() => setTab("people")}
                    onTournament={() => setSurface("tournament")}
                    onVideo={() => setSurface("video")}
                  />
                )}
              </Animated.View>
              <TabBar active={tab} onChange={changeTab} />
            </View>
          </SafeAreaView>
        )}
      </ThemeContext.Provider>
    </OpenDunaAiContext.Provider>
  );

  return (
    <DevicePostureProvider>
      {shell}
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
