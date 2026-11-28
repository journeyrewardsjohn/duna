/**
 * The Player shell (M-P0): the system tab bar (Find · Play · + · Improve ·
 * Connect) through `NavigationChrome`, one `TabRoot` per tab, the New sheet,
 * whole-window Concierge and Ask Duna, and the sheets every screen can open
 * (bookings, events, matches, clubs, court booking, create a match, profile
 * editing). Navigation state lives in `shell-state.ts`; routes in
 * `router.ts`; renderers in `screens.tsx`.
 */
import { AppState, Linking, StyleSheet, View } from "react-native";
import type { EventSummary, MatchSummary } from "@duna/core";
import { demoBookings, demoEvents, demoMatches } from "@duna/core/demo";
import { DevicePostureProvider } from "@duna/expo-device-posture";
import {
  NavigationChrome,
  ThemeOverride,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { dunaAppColors } from "@duna/ui/mobile";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  BookingManagementModal,
  type ManagedBooking,
} from "../../booking-management";
import { createDeferredModalTransition } from "../../deferred-modal-transition";
import { PlayerDunaAiScreen } from "../../duna-ai-screen";
import { NativeEventDetails } from "../../event-details";
import { HealthHistorySyncAgent } from "../../health-history-sync-agent";
import { NativeMatchDetails } from "../../match-details";
import { listenForMessagingNotificationResponses } from "../../messaging-notifications";
import { dunaWebUrl } from "../../mobile-api";
import { OrganizationExperienceModal } from "../../organization-experience";
import { PlayerCalendarAutoSync } from "../../player-calendar-sync";
import { PlayerProfileProvider } from "../../player-social";
import { PlayerArtworkModal, ProfileEditorModal } from "../../profile-studio";
import { usePlayerRuntime } from "../../runtime";
import type { VideoTransferStatus } from "../../video-studio";
import { VisionSecondScreen } from "../../vision-second-screen";
import { CoachProfileModal } from "../features/coaches/CoachProfileModal";
import type { MobileCoach } from "../features/coaches/coach-format";
import type { CourtBookingRequest } from "../features/courts/court-types";
import { VenueFinderModal } from "../features/courts/VenueFinderModal";
import { devLaunchUrl } from "../features/dev/dev-launch";
import {
  PlayerFoundations,
  foundationsAutostart,
  parseFoundationsUrl,
  type FoundationsOptions,
} from "../features/dev/Foundations";
import { PlayerLayoutLab, layoutLabAutostart } from "../features/dev/LayoutLab";
import { BookingModal } from "../features/events/BookingModal";
import type { HomeQuickAction } from "../features/home/home-quick-action";
import { LiveMatchProvider } from "../features/score/LiveMatchContext";
import {
  LiveResumeCard,
  LiveScoreScreen,
} from "../features/score/LiveScoreScreen";
import { rememberSummary } from "../features/score/match-cache";
import { draftFromWatch, type ScoreDraft } from "../features/score/score-draft";
import { WatchDraftSheet } from "../features/score/WatchDraftSheet";
import { PickupModal } from "../features/pickup/PickupModal";
import { colors } from "../shared/palette";
import {
  deepLinkNavigation,
  internalPathTarget,
  parseDevShellUrl,
  parsePlayerDeepLink,
} from "./deep-links";
import { NewSheet } from "./NewSheet";
import { NEW_ACTION, TABS, type TabKey } from "./router";
import { SCREENS } from "./screens";
import {
  RouteEntryContext,
  ShellContext,
  type ShellNavigation,
} from "./ShellContext";
import {
  initialShellState,
  isRouteActive,
  shellReducer,
  type ShellAction,
} from "./shell-state";
import { TabRoot } from "./TabRoot";
import { VideoTransferBanner } from "./VideoTransferBanner";

type OrganizationModalDestination =
  | { readonly kind: "coach"; readonly coach: MobileCoach }
  | { readonly kind: "event"; readonly eventIndex: number }
  | { readonly kind: "external-event"; readonly slug: string }
  | { readonly kind: "venue"; readonly venueId: string };

/** What a Home or New-sheet action opens. Pure; tested in shell tests. */
export function quickActionNavigation(
  action: HomeQuickAction,
): ShellAction | "create-match" {
  switch (action) {
    case "messages":
      return { type: "open", route: "messages" };
    case "upload-score":
      return { type: "open", route: "score" };
    case "score-match":
      return { type: "open", route: "live" };
    case "record-video":
      return { type: "open", route: "video" };
    case "find-coach":
      return { type: "open", route: "coaches" };
    case "create-match":
      return "create-match";
    case "find-match":
    case "book-court":
    case "join-event":
    case "watch-pros":
    case "search":
      return { type: "open", route: "discover", intent: action };
  }
}

export function DunaApp() {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { statusBar, setPreference } = useTheme();
  const setPreferenceRef = useRef(setPreference);
  setPreferenceRef.current = setPreference;
  const [state, dispatch] = useReducer(shellReducer, undefined, () =>
    initialShellState(),
  );
  const [tabletop, setTabletop] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string>();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [eventIndex, setEventIndex] = useState<number | null>(null);
  const [registrationEventOverride, setRegistrationEventOverride] =
    useState<EventSummary>();
  const [eventDetailIndex, setEventDetailIndex] = useState<number | null>(null);
  const [externalEventDetail, setExternalEventDetail] =
    useState<EventSummary>();
  const [selectedMatch, setSelectedMatch] = useState<MatchSummary>();
  const [selectedMatchShareToken, setSelectedMatchShareToken] =
    useState<string>();
  const [pendingMatchOpen, setPendingMatchOpen] = useState<{
    readonly matchId: string;
    readonly shareToken?: string;
  }>();
  const [bookingId, setBookingId] = useState<string>();
  const [courtFinderOpen, setCourtFinderOpen] = useState(false);
  const [organizationSlug, setOrganizationSlug] = useState<string>();
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [organizationCoach, setOrganizationCoach] = useState<MobileCoach>();
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [artworkStudioOpen, setArtworkStudioOpen] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft>();
  const [videoTransfer, setVideoTransfer] = useState<VideoTransferStatus>();
  const [visionRemoteToken, setVisionRemoteToken] = useState<string>();
  // Development-only Layout lab and Foundations gallery: preview builds only.
  const [layoutLabOpen, setLayoutLabOpen] = useState(
    Boolean(layoutLabAutostart),
  );
  const [foundations, setFoundations] = useState<FoundationsOptions | null>(
    foundationsAutostart,
  );
  const mountedAt = useRef(Date.now());
  const previewRef = useRef(runtime.mode === "preview");
  previewRef.current = runtime.mode === "preview";

  const organizationTransitionRef = useRef<
    | ReturnType<
        typeof createDeferredModalTransition<OrganizationModalDestination>
      >
    | undefined
  >(undefined);
  if (!organizationTransitionRef.current) {
    organizationTransitionRef.current =
      createDeferredModalTransition<OrganizationModalDestination>({
        onComplete: (destination) => {
          if (destination.kind === "coach")
            setOrganizationCoach(destination.coach);
          if (destination.kind === "event") {
            setExternalEventDetail(undefined);
            setEventDetailIndex(destination.eventIndex);
          }
          if (destination.kind === "external-event") {
            void WebBrowser.openBrowserAsync(
              `${dunaWebUrl}/events/${encodeURIComponent(destination.slug)}`,
            );
          }
          if (destination.kind === "venue")
            dispatch({
              type: "open",
              route: "court",
              targetId: destination.venueId,
            });
        },
      });
  }
  const organizationTransition = organizationTransitionRef.current;
  useEffect(
    () => () => organizationTransition.cancel(),
    [organizationTransition],
  );

  const events = runtime.dashboard?.events ?? demoEvents;
  const matches = runtime.dashboard?.recentMatches ?? demoMatches;

  // A finished or processing upload clears itself.
  useEffect(() => {
    if (!videoTransfer) return;
    if (
      videoTransfer.stage !== "complete" &&
      videoTransfer.stage !== "processing"
    )
      return;
    const timeout = setTimeout(
      () => setVideoTransfer(undefined),
      videoTransfer.stage === "complete" ? 7_500 : 11_000,
    );
    return () => clearTimeout(timeout);
  }, [videoTransfer]);

  // Every Player link resolves to a place in the shell (deep-links.test.ts).
  useEffect(() => {
    const openLink = (url: string | null) => {
      const foundationsLink = parseFoundationsUrl(url);
      if (foundationsLink) {
        if (previewRef.current) setFoundations(foundationsLink);
        return;
      }
      const devShell = parseDevShellUrl(url);
      if (devShell) {
        if (!previewRef.current) return;
        if (devShell.theme) setPreferenceRef.current(devShell.theme);
        for (const action of devShell.actions) {
          if (action.type === "open-sheet") setNewSheetOpen(true);
          else dispatch(action);
        }
        return;
      }
      if (url?.startsWith("duna://dev/layout-lab")) {
        if (previewRef.current) setLayoutLabOpen(true);
        return;
      }
      const link = parsePlayerDeepLink(url);
      if (!link) return;
      if (link.kind === "vision-remote") {
        setVisionRemoteToken(decodeURIComponent(link.token));
        return;
      }
      if (link.kind === "match") {
        setPendingMatchOpen({
          matchId: decodeURIComponent(link.matchId),
          ...(link.shareToken ? { shareToken: link.shareToken } : {}),
        });
        return;
      }
      if (link.kind === "match-claim") {
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/join/match/${encodeURIComponent(decodeURIComponent(link.token))}`,
        );
        return;
      }
      if (link.kind === "waiver") {
        // The secure web completion surface, in an in-app browser.
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/waivers/complete?${link.query}`,
        );
        return;
      }
      setEventIndex(null);
      if (link.kind === "booking")
        setBookingId(decodeURIComponent(link.bookingId));
      const navigation = deepLinkNavigation(link);
      if (navigation) dispatch(navigation);
    };
    void Linking.getInitialURL().then((url) => openLink(url ?? devLaunchUrl()));
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openLink(url),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pendingMatchOpen) return;
    const localMatch = matches.find(
      (match) => match.id === pendingMatchOpen.matchId,
    );
    if (localMatch && !pendingMatchOpen.shareToken) {
      rememberSummary(localMatch);
      dispatch({ type: "open", route: "result", targetId: localMatch.id });
      setPendingMatchOpen(undefined);
      return;
    }
    if (localMatch) {
      setSelectedMatch(localMatch);
      setSelectedMatchShareToken(pendingMatchOpen.shareToken);
      setPendingMatchOpen(undefined);
      return;
    }
    if (runtime.client && !pendingMatchOpen.shareToken) {
      // A signed-in player's match opens as its result (it loads there).
      dispatch({
        type: "open",
        route: "result",
        targetId: pendingMatchOpen.matchId,
      });
      setPendingMatchOpen(undefined);
      return;
    }
    const client = runtime.publicClient ?? runtime.client;
    if (!client) return;
    let active = true;
    const loadMatch = runtime.client
      ? runtime.client.player.matchById
          .query({ matchId: pendingMatchOpen.matchId })
          .catch(() =>
            client.public.matchDetails.query({
              matchId: pendingMatchOpen.matchId,
            }),
          )
      : client.public.matchDetails.query({ matchId: pendingMatchOpen.matchId });
    void loadMatch
      .then((match) => {
        if (!active) return;
        setSelectedMatch(match);
        setSelectedMatchShareToken(pendingMatchOpen.shareToken);
      })
      .catch(() => {
        if (!active) return;
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/matches/${encodeURIComponent(pendingMatchOpen.matchId)}${pendingMatchOpen.shareToken ? `?notes=${encodeURIComponent(pendingMatchOpen.shareToken)}` : ""}`,
        );
      })
      .finally(() => {
        if (active) setPendingMatchOpen(undefined);
      });
    return () => {
      active = false;
    };
  }, [matches, pendingMatchOpen, runtime.client, runtime.publicClient]);

  useEffect(
    () =>
      listenForMessagingNotificationResponses(() => {
        void runtime.messagingDelivery?.syncAll().catch(() => undefined);
        void runtime.client?.messaging.inbox
          .query({ asPrincipal: "user" })
          .then((inbox) => setUnreadMessages(inbox.totalUnread))
          .catch(() => undefined);
      }),
    [runtime.client, runtime.messagingDelivery],
  );

  useEffect(() => {
    if (runtime.mode !== "live" || !runtime.client) return;
    const client = runtime.client;
    const refreshUnread = () =>
      client.messaging.inbox
        .query({ asPrincipal: "user" })
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
  }, [runtime.client, runtime.mode]);

  // "Add a result" keeps its draft only while it is open.
  const scoreOpen = isRouteActive(state, "score");
  useEffect(() => {
    if (!scoreOpen && scoreDraft) setScoreDraft(undefined);
  }, [scoreOpen, scoreDraft]);

  const openEventAtIndex = useCallback(
    (index: number) => {
      if (!events[index]) return;
      setExternalEventDetail(undefined);
      setEventDetailIndex(index);
    },
    [events],
  );
  const openEvent = useCallback((event: EventSummary) => {
    setEventDetailIndex(null);
    setExternalEventDetail(event);
  }, []);
  const openMatch = useCallback((match: MatchSummary) => {
    rememberSummary(match);
    dispatch({ type: "open", route: "result", targetId: match.id });
  }, []);
  const openMatchDetails = useCallback((match: MatchSummary) => {
    setSelectedMatch(match);
    setSelectedMatchShareToken(undefined);
  }, []);

  /** Every way into court booking lands on the venue's court times (M-P3). */
  const openCourt = useCallback(
    (request: Partial<CourtBookingRequest> & { readonly venueId: string }) =>
      dispatch({
        type: "open",
        route: "court",
        targetId: request.venueId,
        court: {
          ...(request.date ? { date: request.date } : {}),
          ...(request.durationMinutes
            ? { durationMinutes: request.durationMinutes }
            : {}),
          ...(request.intent ? { intent: request.intent } : {}),
        },
      }),
    [],
  );

  const runAction = useCallback((action: HomeQuickAction) => {
    if (action === "upload-score") setScoreDraft(undefined);
    const navigation = quickActionNavigation(action);
    if (navigation === "create-match") setCreateMatchOpen(true);
    else dispatch(navigation);
  }, []);

  const openPath = useCallback(
    (href: string) => {
      const target = internalPathTarget(href);
      switch (target.kind) {
        case "event": {
          const index = events.findIndex(
            (event) =>
              event.id === target.identifier ||
              event.slug === target.identifier,
          );
          if (index >= 0) {
            openEventAtIndex(index);
            return;
          }
          break;
        }
        case "venue":
          openCourt({ venueId: target.venueId });
          return;
        case "club":
          setOrganizationSlug(target.slug);
          return;
        case "booking":
          setBookingId(target.bookingId);
          return;
        case "match": {
          const match = matches.find(
            (candidate) => candidate.id === target.matchId,
          );
          if (match && !target.shareToken) {
            openMatch(match);
          } else if (match) {
            setSelectedMatch(match);
            setSelectedMatchShareToken(target.shareToken);
          } else {
            setPendingMatchOpen({
              matchId: target.matchId,
              ...(target.shareToken ? { shareToken: target.shareToken } : {}),
            });
          }
          return;
        }
        case "navigate":
          dispatch(target.action);
          return;
        case "browser":
          break;
      }
      void WebBrowser.openBrowserAsync(
        /^https?:\/\//i.test(href)
          ? href
          : `${dunaWebUrl}${href.startsWith("/") ? href : `/${href}`}`,
      );
    },
    [events, matches, openCourt, openEventAtIndex, openMatch],
  );

  const shell = useMemo<ShellNavigation>(
    () => ({
      dispatch,
      open: (route, options) => dispatch({ type: "open", route, ...options }),
      back: (tab: TabKey) => dispatch({ type: "back", tab }),
      action: runAction,
      askDuna: (prompt) => {
        setAiInitialPrompt(prompt);
        dispatch({ type: "open", route: "ai" });
      },
      openBooking: setBookingId,
      openEvent,
      openEventAtIndex,
      registerForEvent: setEventIndex,
      openMatch,
      openMatchDetails,
      openOrganization: setOrganizationSlug,
      openVenue: (venueId: string) => openCourt({ venueId }),
      openCourtBooking: openCourt,
      createMatch: () => setCreateMatchOpen(true),
      editProfile: () => setProfileEditorOpen(true),
      openArtwork: () => setArtworkStudioOpen(true),
      openPath,
      unreadMessages,
      setUnreadMessages,
      scoreDraft,
      reviewWatchScore: (draft) => {
        setScoreDraft(draftFromWatch(draft));
        dispatch({ type: "open", route: "score" });
      },
      addResult: (draft) => {
        setScoreDraft(draft);
        dispatch({ type: "open", route: "score" });
      },
      onVideoTransfer: setVideoTransfer,
      openLayoutLab: () => {
        if (previewRef.current) setLayoutLabOpen(true);
      },
    }),
    [
      openCourt,
      openEvent,
      openEventAtIndex,
      openMatch,
      openMatchDetails,
      openPath,
      runAction,
      scoreDraft,
      unreadMessages,
    ],
  );

  const selectedBooking = runtime.dashboard?.bookings.find(
    (booking) => booking.id === bookingId,
  );
  const selectedEventDetail =
    externalEventDetail ??
    (eventDetailIndex === null ? undefined : events[eventDetailIndex]);
  const selectedEventBooking = selectedEventDetail
    ? (runtime.dashboard?.bookings ?? demoBookings).find(
        (booking) =>
          booking.sessionId === selectedEventDetail.id ||
          (booking.title === selectedEventDetail.title &&
            Math.abs(
              Date.parse(booking.startsAt) -
                Date.parse(selectedEventDetail.startsAt),
            ) <
              15 * 60_000),
      )
    : undefined;
  const windowRoute = state.window?.entry;
  return (
    <DevicePostureProvider>
      <ShellContext.Provider value={shell}>
        <LiveMatchProvider active={windowRoute?.key === "live"}>
          <PlayerProfileProvider palette={colors}>
            <HealthHistorySyncAgent
              paused={isRouteActive(state, "health")}
              runtime={runtime}
            />
            {runtime.dashboard ? (
              <PlayerCalendarAutoSync bookings={runtime.dashboard.bookings} />
            ) : null}
            <StatusBar style={statusBar === "light" ? "light" : "dark"} />
            <View style={styles.fill}>
              <NavigationChrome
                centerAction={{
                  key: NEW_ACTION.key,
                  title: NEW_ACTION.title,
                  systemImage: NEW_ACTION.systemImage,
                  onPress: () => {
                    haptics.confirmed(1);
                    setNewSheetOpen(true);
                  },
                }}
                hidden={tabletop || Boolean(windowRoute)}
                onSelect={(key) => {
                  // iPad's sidebar-adaptable tab bar reports its first tab once
                  // while it mounts; that echo is not a person's choice (it
                  // would open Find, and its location prompt, at launch).
                  if (Date.now() - mountedAt.current < 1_500) return;
                  dispatch({ type: "select-tab", tab: key as TabKey });
                }}
                selected={state.tab}
                tabs={TABS.map((tab) => ({
                  key: tab.key,
                  title: tab.title,
                  systemImage: tab.systemImage,
                  content: (
                    <TabRoot
                      onTabletopChange={setTabletop}
                      state={state}
                      tab={tab.key}
                    />
                  ),
                }))}
              />
              {windowRoute?.key === "live" ? (
                <View
                  style={[StyleSheet.absoluteFill, styles.window]}
                  testID="live-window"
                >
                  <SafeAreaProvider style={styles.fill}>
                    <RouteEntryContext.Provider value={windowRoute}>
                      <LiveScoreScreen />
                    </RouteEntryContext.Provider>
                  </SafeAreaProvider>
                </View>
              ) : (
                <LiveResumeCard
                  onResume={() => dispatch({ type: "open", route: "live" })}
                />
              )}
              {windowRoute?.key === "messages" ? (
                <View style={[StyleSheet.absoluteFill, styles.window]}>
                  <ThemeOverride theme="light">
                    <SafeAreaProvider style={styles.fill}>
                      {SCREENS.messages(windowRoute, shell)}
                    </SafeAreaProvider>
                  </ThemeOverride>
                </View>
              ) : null}
              {/* Ask Duna stays mounted so its conversation survives closing it. */}
              <View
                pointerEvents={windowRoute?.key === "ai" ? "auto" : "none"}
                style={[
                  StyleSheet.absoluteFill,
                  windowRoute?.key === "ai" ? styles.window : styles.hidden,
                ]}
              >
                <PlayerDunaAiScreen
                  active={windowRoute?.key === "ai"}
                  initialPrompt={aiInitialPrompt}
                  onClose={() => dispatch({ type: "close-window" })}
                  onInitialPromptConsumed={() => setAiInitialPrompt(undefined)}
                  onOpenBooking={setBookingId}
                  onOpenEvent={(eventId, action, href) => {
                    const index = events.findIndex(
                      (event) => event.id === eventId,
                    );
                    if (index < 0) {
                      openPath(href);
                      return;
                    }
                    if (action === "book-event") setEventIndex(index);
                    else openEventAtIndex(index);
                  }}
                  onOpenMatch={(matchId, href) => {
                    const match = matches.find(
                      (candidate) => candidate.id === matchId,
                    );
                    if (match) openMatch(match);
                    else if (href) openPath(href);
                    else setPendingMatchOpen({ matchId });
                  }}
                  onOpenMessages={() =>
                    dispatch({ type: "open", route: "messages" })
                  }
                  onOpenPath={openPath}
                  onOpenVenue={(venueId) => openCourt({ venueId })}
                  palette={{
                    canvas: dunaAppColors.card,
                    surface: dunaAppColors.card,
                    surfaceAlt: dunaAppColors.subtle,
                    border: dunaAppColors.hairline,
                    text: dunaAppColors.ink,
                    muted: dunaAppColors.textSecondary,
                    accent: dunaAppColors.ink,
                    onAccent: dunaAppColors.card,
                    positive: colors.positive,
                    warning: colors.warning,
                    danger: colors.danger,
                  }}
                  pathname="/app/ai"
                />
              </View>
              {videoTransfer ? (
                <VideoTransferBanner
                  onDismiss={() => setVideoTransfer(undefined)}
                  onPress={() => {
                    setVideoTransfer(undefined);
                    dispatch({ type: "open", route: "video" });
                  }}
                  status={videoTransfer}
                />
              ) : null}
              <NewSheet
                onAction={runAction}
                onClose={() => setNewSheetOpen(false)}
                visible={newSheetOpen}
              />
              {visionRemoteToken && (runtime.publicClient ?? runtime.client) ? (
                <VisionSecondScreen
                  client={(runtime.publicClient ?? runtime.client)!}
                  onClose={() => setVisionRemoteToken(undefined)}
                  token={visionRemoteToken}
                />
              ) : null}
              <BookingModal
                eventIndex={eventIndex}
                eventOverride={registrationEventOverride}
                onClose={() => {
                  setEventIndex(null);
                  setRegistrationEventOverride(undefined);
                }}
              />
              <NativeEventDetails
                bookingId={selectedEventBooking?.id}
                client={runtime.client}
                event={selectedEventDetail}
                onClose={() => {
                  setEventDetailIndex(null);
                  setExternalEventDetail(undefined);
                }}
                onOpenBooking={setBookingId}
                onRegister={(registrationEvent) => {
                  const index = events.findIndex(
                    (event) => event.id === registrationEvent.id,
                  );
                  if (index >= 0) {
                    setEventIndex(index);
                    return;
                  }
                  setRegistrationEventOverride(registrationEvent);
                }}
                onScore={() => dispatch({ type: "open", route: "score" })}
                onVideo={() => dispatch({ type: "open", route: "video" })}
                visible={Boolean(selectedEventDetail)}
              />
              <NativeMatchDetails
                client={runtime.client}
                match={selectedMatch}
                onClose={() => {
                  setSelectedMatch(undefined);
                  setSelectedMatchShareToken(undefined);
                }}
                publicClient={runtime.publicClient}
                shareToken={selectedMatchShareToken}
                transcribeVoice={runtime.transcribeMatchJournalVoice}
                visible={Boolean(selectedMatch)}
              />
              <ProfileEditorModal
                onClose={() => setProfileEditorOpen(false)}
                visible={profileEditorOpen}
              />
              <PlayerArtworkModal
                onClose={() => setArtworkStudioOpen(false)}
                visible={artworkStudioOpen}
              />
              <BookingManagementModal
                booking={selectedBooking as ManagedBooking | undefined}
                client={runtime.client}
                onClose={() => setBookingId(undefined)}
                onUpdated={runtime.refresh}
                palette={colors}
                visible={Boolean(selectedBooking)}
              />
              <VenueFinderModal
                onClose={() => setCourtFinderOpen(false)}
                onSelect={(request) => {
                  setCourtFinderOpen(false);
                  openCourt(request);
                }}
                visible={courtFinderOpen}
              />
              <OrganizationExperienceModal
                onClose={() => setOrganizationSlug(undefined)}
                onDismiss={organizationTransition.complete}
                onOpenCoach={(coach) => {
                  organizationTransition.schedule({ kind: "coach", coach });
                  setOrganizationSlug(undefined);
                }}
                onOpenEvent={(eventId, eventSlug) => {
                  const index = (runtime.dashboard?.events ?? []).findIndex(
                    (event) => event.id === eventId,
                  );
                  organizationTransition.schedule(
                    index >= 0
                      ? { kind: "event", eventIndex: index }
                      : { kind: "external-event", slug: eventSlug },
                  );
                  setOrganizationSlug(undefined);
                }}
                onOpenVenue={(venueId) => {
                  organizationTransition.schedule({ kind: "venue", venueId });
                  setOrganizationSlug(undefined);
                }}
                slug={organizationSlug}
                theme="light"
              />
              <PickupModal
                onClose={() => setCreateMatchOpen(false)}
                onReserveCourtVenue={(request) => {
                  setCreateMatchOpen(false);
                  openCourt(request);
                }}
                visible={createMatchOpen}
              />
              <CoachProfileModal
                coach={organizationCoach}
                onClose={() => setOrganizationCoach(undefined)}
                onOpenSession={(session) => {
                  const index = events.findIndex(
                    (event) => event.id === session.id,
                  );
                  if (index >= 0) {
                    openEventAtIndex(index);
                    return;
                  }
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/events/${encodeURIComponent(session.slug)}`,
                  );
                }}
              />
              <WatchDraftSheet onReview={shell.reviewWatchScore} />
            </View>
          </PlayerProfileProvider>
        </LiveMatchProvider>
      </ShellContext.Provider>
      {layoutLabOpen && runtime.mode === "preview" ? (
        <PlayerLayoutLab onClose={() => setLayoutLabOpen(false)} />
      ) : null}
      {foundations && runtime.mode === "preview" ? (
        <PlayerFoundations
          initial={foundations}
          onClose={() => setFoundations(null)}
        />
      ) : null}
    </DevicePostureProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  window: { backgroundColor: colors.canvas, zIndex: 10 },
  hidden: { opacity: 0 },
});
