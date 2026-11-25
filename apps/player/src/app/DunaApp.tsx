import type { EventSummary, MatchSummary } from "@duna/core";
import { demoBookings, demoEvents, demoMatches } from "@duna/core/demo";
import { dunaAppColors } from "@duna/ui/mobile";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Linking, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dunaWebUrl } from "../../mobile-api";
import { usePlayerRuntime } from "../../runtime";
import type { WatchScoreDraft } from "../../watch-scoring";
import {
  VideoStudioScreen,
  type VideoTransferStatus,
} from "../../video-studio";
import { VisionSecondScreen } from "../../vision-second-screen";
import { HealthScreen } from "../../health-screen";
import { HealthHistorySyncAgent } from "../../health-history-sync-agent";
import {
  BookingManagementModal,
  type ManagedBooking,
} from "../../booking-management";
import { PlayerCalendarAutoSync } from "../../player-calendar-sync";
import { ProfileHubScreen } from "../../profile-hub";
import { PlayerArtworkModal, ProfileEditorModal } from "../../profile-studio";
import { ScoreUploadScreen } from "../../score-upload";
import { NativeEventDetails } from "../../event-details";
import { NativeMatchDetails } from "../../match-details";
import { createDeferredModalTransition } from "../../deferred-modal-transition";
import { OrganizationExperienceModal } from "../../organization-experience";
import { PlayerMessagingScreen } from "../../messaging-screen";
import { listenForMessagingNotificationResponses } from "../../messaging-notifications";
import { PlayerProfileProvider } from "../../player-social";
import { PlayerTrainingScreen } from "../../training-screen";
import { PlayerDunaAiScreen } from "../../duna-ai-screen";
import type { MobileCoach } from "../features/coaches/coach-format";
import { BookingModal } from "../features/events/BookingModal";
import { PerformanceScreen } from "../features/profile/PerformanceScreen";
import { type ThemeName, colors, rgba } from "../shared/palette";
import { useReducedMotion } from "../shared/use-reduced-motion";
import { MessagingNavigationContext, type Tab } from "./navigation";
import type { CourtBookingRequest } from "../features/courts/court-types";
import { VenueBookingModal } from "../features/courts/VenueBookingModal";
import { PickupModal } from "../features/pickup/PickupModal";
import { PreviewBanner } from "./PreviewBanner";
import { CoachProfileModal } from "../features/coaches/CoachProfileModal";
import type { HomeQuickAction } from "../features/home/home-quick-action";
import type { DiscoverIntentKind } from "../features/discovery/discover-intent";
import { HomeScreenV3 } from "../features/home/HomeScreenV3";
import { VenueFinderModal } from "../features/courts/VenueFinderModal";
import { DiscoverScreen } from "../features/discovery/DiscoverScreen";
import { FindCoachScreen } from "../features/coaches/FindCoachScreen";
import { PlayLauncherScreen } from "../features/discovery/PlayLauncherScreen";
import { PlansScreen } from "../features/calendar/PlansScreen";
import { WalletScreen } from "../features/wallet/WalletScreen";
import { PredictionPortfolioScreen } from "../features/predictions/PredictionPortfolioScreen";
import { TabBar } from "./TabBar";
import { QuickActionsSheet } from "./QuickActionsSheet";
import { VideoTransferBanner } from "./VideoTransferBanner";
import { WatchScoreInbox } from "../features/matches/WatchScoreInbox";
import { styles } from "../legacy/styles";

type OrganizationModalDestination =
  | { readonly kind: "coach"; readonly coach: MobileCoach }
  | { readonly kind: "event"; readonly eventIndex: number }
  | { readonly kind: "external-event"; readonly slug: string }
  | { readonly kind: "venue"; readonly venueId: string };

export function DunaApp() {
  const runtime = usePlayerRuntime();
  const theme: ThemeName = "light";
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>("home");
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string>();
  const [aiReturnTab, setAiReturnTab] = useState<Tab>("home");
  const [performanceReturnTab, setPerformanceReturnTab] = useState<
    "home" | "you"
  >("you");
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [messagesOpenToSupport, setMessagesOpenToSupport] = useState(false);
  const [messagesConversationId, setMessagesConversationId] =
    useState<string>();
  const [messagingUnreadCount, setMessagingUnreadCount] = useState(0);
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
  const [courtBookingRequest, setCourtBookingRequest] =
    useState<CourtBookingRequest>();
  const [organizationSlug, setOrganizationSlug] = useState<string>();
  const [organizationVenueId, setOrganizationVenueId] = useState<string>();
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [organizationCoach, setOrganizationCoach] = useState<MobileCoach>();
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
          if (destination.kind === "coach") {
            setOrganizationCoach(destination.coach);
          }
          if (destination.kind === "event") {
            setExternalEventDetail(undefined);
            setEventDetailIndex(destination.eventIndex);
          }
          if (destination.kind === "external-event") {
            void WebBrowser.openBrowserAsync(
              `${dunaWebUrl}/events/${encodeURIComponent(destination.slug)}`,
            );
          }
          if (destination.kind === "venue") {
            setOrganizationVenueId(destination.venueId);
          }
        },
      });
  }
  const organizationTransition = organizationTransitionRef.current;
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [artworkStudioOpen, setArtworkStudioOpen] = useState(false);
  const [watchScoreDraft, setWatchScoreDraft] = useState<WatchScoreDraft>();
  const [videoTransfer, setVideoTransfer] = useState<VideoTransferStatus>();
  const [visionRemoteToken, setVisionRemoteToken] = useState<string>();
  const [discoverIntent, setDiscoverIntent] = useState<{
    readonly key: number;
    readonly kind: DiscoverIntentKind;
  }>();
  const screenTransition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!videoTransfer) return;
    if (
      videoTransfer.stage !== "complete" &&
      videoTransfer.stage !== "processing"
    ) {
      return;
    }
    const timeout = setTimeout(
      () => setVideoTransfer(undefined),
      videoTransfer.stage === "complete" ? 7_500 : 11_000,
    );
    return () => clearTimeout(timeout);
  }, [videoTransfer]);

  useEffect(
    () => () => {
      organizationTransition.cancel();
    },
    [organizationTransition],
  );

  useEffect(() => {
    const openLiveActivity = (url: string | null) => {
      const visionRemote = url?.match(
        /^duna:\/\/vision\/remote\/([^/?#]+)/,
      )?.[1];
      if (visionRemote) {
        setVisionRemoteToken(decodeURIComponent(visionRemote));
        return;
      }
      const matchDetailId =
        url?.match(/^duna:\/\/matches\/([^/?#]+)/)?.[1] ??
        url?.match(/^https?:\/\/[^/]+\/matches\/([^/?#]+)/)?.[1];
      if (matchDetailId && url) {
        let shareToken: string | undefined;
        try {
          shareToken = new URL(url).searchParams.get("notes") ?? undefined;
        } catch {
          shareToken = undefined;
        }
        setPendingMatchOpen({
          matchId: decodeURIComponent(matchDetailId),
          ...(shareToken ? { shareToken } : {}),
        });
        return;
      }
      const matchClaimToken = url?.match(
        /^duna:\/\/join\/match\/([^/?#]+)/,
      )?.[1];
      if (matchClaimToken) {
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/join/match/${encodeURIComponent(decodeURIComponent(matchClaimToken))}`,
        );
        return;
      }
      if (url?.startsWith("duna://waiver/complete")) {
        const query = url.split("?")[1] ?? "";
        // The signed-in app keeps the same secure web completion surface in an
        // in-app browser, while a shared HTTPS link remains usable everywhere.
        void WebBrowser.openBrowserAsync(
          `${dunaWebUrl}/waivers/complete?${query}`,
        );
        return;
      }
      if (url?.startsWith("duna://ai")) {
        setEventIndex(null);
        setAiReturnTab("home");
        setTab("ai");
        return;
      }
      if (url?.startsWith("duna://messages")) {
        setEventIndex(null);
        const conversationId = url.match(/^duna:\/\/messages\/([^/?#]+)/)?.[1];
        const decoded = conversationId
          ? decodeURIComponent(conversationId)
          : undefined;
        setMessagesOpenToSupport(decoded === "support");
        setMessagesConversationId(
          decoded && decoded !== "support" ? decoded : undefined,
        );
        setTab("messages");
        return;
      }
      const bookingMatch = url?.match(/^duna:\/\/booking\/([^/?#]+)/);
      if (bookingMatch?.[1]) {
        setEventIndex(null);
        setBookingId(decodeURIComponent(bookingMatch[1]));
        setTab("plans");
        return;
      }
      const match = url?.match(/^duna:\/\/live\/([^/]+)\//);
      if (!match) return;
      setEventIndex(null);
      setTab(
        match[1] === "upload"
          ? "video"
          : match[1] === "upcoming"
            ? "home"
            : "discover",
      );
    };
    void Linking.getInitialURL().then(openLiveActivity);
    const subscription = Linking.addEventListener("url", ({ url }) =>
      openLiveActivity(url),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pendingMatchOpen) return;
    const localMatch = (runtime.dashboard?.recentMatches ?? demoMatches).find(
      (match) => match.id === pendingMatchOpen.matchId,
    );
    if (localMatch) {
      setSelectedMatch(localMatch);
      setSelectedMatchShareToken(pendingMatchOpen.shareToken);
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
  }, [
    pendingMatchOpen,
    runtime.client,
    runtime.dashboard,
    runtime.publicClient,
  ]);

  useEffect(
    () =>
      listenForMessagingNotificationResponses(() => {
        void runtime.messagingDelivery?.syncAll().catch(() => undefined);
        void runtime.client?.messaging.inbox
          .query({ asPrincipal: "user" })
          .then((inbox) => setMessagingUnreadCount(inbox.totalUnread))
          .catch(() => undefined);
      }),
    [runtime.client, runtime.messagingDelivery],
  );

  useEffect(() => {
    if (runtime.mode !== "live" || !runtime.client) return;
    const refreshUnread = () =>
      runtime
        .client!.messaging.inbox.query({ asPrincipal: "user" })
        .then((inbox) => setMessagingUnreadCount(inbox.totalUnread))
        .catch(() => undefined);
    void refreshUnread();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshUnread();
    });
    const interval = setInterval(() => void refreshUnread(), 30_000);
    return () => {
      appState.remove();
      clearInterval(interval);
    };
  }, [runtime.client, runtime.mode]);

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

  useEffect(() => {
    if (tab !== "score" && watchScoreDraft) setWatchScoreDraft(undefined);
  }, [tab, watchScoreDraft]);

  const openHomeAction = (action: HomeQuickAction) => {
    if (action === "messages") {
      setMessagesConversationId(undefined);
      setMessagesOpenToSupport(false);
      setTab("messages");
      return;
    }
    if (action === "upload-score") {
      setWatchScoreDraft(undefined);
      setTab("score");
      return;
    }
    if (action === "record-video") {
      setTab("video");
      return;
    }
    if (action === "create-match") {
      setCreateMatchOpen(true);
      return;
    }
    if (action === "find-coach") {
      setTab("coaches");
      return;
    }
    setDiscoverIntent({ key: Date.now(), kind: action });
    setTab("discover");
  };
  const openDunaHref = (href: string) => {
    let path = href;
    if (/^https?:\/\//i.test(href)) {
      try {
        const url = new URL(href);
        path = `${url.pathname}${url.search}`;
      } catch {
        void WebBrowser.openBrowserAsync(href);
        return;
      }
    }

    const eventPath = path.match(/^\/events\/([^/?#]+)/);
    if (eventPath?.[1]) {
      const identifier = decodeURIComponent(eventPath[1]);
      const index = (runtime.dashboard?.events ?? demoEvents).findIndex(
        (event) => event.id === identifier || event.slug === identifier,
      );
      if (index >= 0) {
        setExternalEventDetail(undefined);
        setEventDetailIndex(index);
        return;
      }
    }
    const venuePath = path.match(/^\/venues\/([^/?#]+)/);
    if (venuePath?.[1]) {
      setOrganizationVenueId(decodeURIComponent(venuePath[1]));
      return;
    }
    const clubPath = path.match(/^\/clubs\/([^/?#]+)/);
    if (clubPath?.[1]) {
      setOrganizationSlug(decodeURIComponent(clubPath[1]));
      return;
    }
    const bookingPath = path.match(/^\/(?:app\/)?bookings?\/([^/?#]+)/);
    if (bookingPath?.[1]) {
      setBookingId(decodeURIComponent(bookingPath[1]));
      return;
    }
    const matchPath = path.match(/^\/(?:app\/)?matches\/([^/?#]+)/);
    if (matchPath?.[1]) {
      const matchId = decodeURIComponent(matchPath[1]);
      const match = (runtime.dashboard?.recentMatches ?? demoMatches).find(
        (candidate) => candidate.id === matchId,
      );
      const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
      const shareToken = new URLSearchParams(query).get("notes") ?? undefined;
      if (match) {
        setSelectedMatch(match);
        setSelectedMatchShareToken(shareToken);
      } else {
        setPendingMatchOpen({
          matchId,
          ...(shareToken ? { shareToken } : {}),
        });
      }
      return;
    }
    if (/^\/app\/matches(?:\/|$)/.test(path)) {
      setPerformanceReturnTab("home");
      setTab("performance");
      return;
    }
    if (/^\/(?:app\/)?discover(?:\/|$)/.test(path)) {
      setTab("discover");
      return;
    }
    if (/^\/app\/play(?:\/|$)/.test(path)) {
      setTab("plans");
      return;
    }
    if (path === "/app" || path.startsWith("/app?")) {
      setTab("home");
      return;
    }

    void WebBrowser.openBrowserAsync(
      /^https?:\/\//i.test(href)
        ? href
        : `${dunaWebUrl}${href.startsWith("/") ? href : `/${href}`}`,
    );
  };
  const openAiEvent = (
    eventId: string,
    action: "book-event" | "view-event",
    href: string,
  ) => {
    const index = (runtime.dashboard?.events ?? demoEvents).findIndex(
      (event) => event.id === eventId,
    );
    if (index < 0) {
      openDunaHref(href);
      return;
    }
    if (action === "book-event") setEventIndex(index);
    else {
      setExternalEventDetail(undefined);
      setEventDetailIndex(index);
    }
  };
  const openAiMatch = (matchId: string, href?: string) => {
    const match = (runtime.dashboard?.recentMatches ?? demoMatches).find(
      (candidate) => candidate.id === matchId,
    );
    if (match) {
      setSelectedMatch(match);
      setSelectedMatchShareToken(undefined);
      return;
    }
    if (href) {
      openDunaHref(href);
      return;
    }
    setPendingMatchOpen({ matchId });
  };
  const selectedBooking = runtime.dashboard?.bookings.find(
    (booking) => booking.id === bookingId,
  );
  const selectedEventDetail =
    externalEventDetail ??
    (eventDetailIndex === null
      ? undefined
      : (runtime.dashboard?.events ?? demoEvents)[eventDetailIndex]);
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
  const openEventDetailAtIndex = (index: number) => {
    const event = (runtime.dashboard?.events ?? demoEvents)[index];
    if (!event) return;
    setExternalEventDetail(undefined);
    setEventDetailIndex(index);
  };
  const openExternalEventDetail = (event: EventSummary) => {
    setEventDetailIndex(null);
    setExternalEventDetail(event);
  };

  return (
    <MessagingNavigationContext.Provider
      value={{
        open: (support) => {
          setMessagesConversationId(undefined);
          setMessagesOpenToSupport(support);
          setTab("messages");
        },
        openProfile: () => setTab("you"),
        unreadCount: messagingUnreadCount,
      }}
    >
      <PlayerProfileProvider palette={colors}>
        <HealthHistorySyncAgent paused={tab === "health"} runtime={runtime} />
        {runtime.dashboard ? (
          <PlayerCalendarAutoSync bookings={runtime.dashboard.bookings} />
        ) : null}
        <SafeAreaView edges={["top"]} style={styles.safe}>
          <StatusBar style="dark" />
          <View style={styles.app}>
            <PreviewBanner
              hidden={tab === "home" || tab === "messages" || tab === "ai"}
            />
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
              {tab === "home" && (
                <HomeScreenV3
                  onAskDuna={(prompt) => {
                    setAiInitialPrompt(prompt);
                    setAiReturnTab("home");
                    setTab("ai");
                  }}
                  onAction={openHomeAction}
                  onOpenBooking={setBookingId}
                  onOpenEvent={openExternalEventDetail}
                  onOpenMatch={(match) => {
                    setSelectedMatch(match);
                    setSelectedMatchShareToken(undefined);
                  }}
                  onOpenPerformance={() => {
                    setPerformanceReturnTab("home");
                    setTab("performance");
                  }}
                  onOpenSchedule={() => setTab("plans")}
                />
              )}
              {tab === "discover" && (
                <DiscoverScreen
                  intent={discoverIntent}
                  onBook={setEventIndex}
                  onCreateMatch={() => setCreateMatchOpen(true)}
                  onOpenEvent={openEventDetailAtIndex}
                  onOpenExternalEvent={openExternalEventDetail}
                  onOrganization={setOrganizationSlug}
                />
              )}
              {tab === "score" && (
                <ScoreUploadScreen
                  initialPlayedAt={watchScoreDraft?.capturedAt}
                  initialSets={watchScoreDraft?.sets}
                  key={watchScoreDraft?.draftId ?? "score-upload"}
                  onComplete={() => {
                    setPerformanceReturnTab("you");
                    setTab("performance");
                  }}
                  palette={colors}
                />
              )}
              {tab === "play" && (
                <PlayLauncherScreen onAction={openHomeAction} />
              )}
              {tab === "coaches" && (
                <FindCoachScreen
                  onBack={() => setTab("play")}
                  onOpenEvent={openEventDetailAtIndex}
                />
              )}
              {tab === "plans" && (
                <PlansScreen
                  onOpenBooking={setBookingId}
                  onOpenEvent={openEventDetailAtIndex}
                  onReserveCourtVenue={setCourtBookingRequest}
                  onTraining={() => setTab("training")}
                  onSeeAllMatches={() => {
                    setDiscoverIntent({
                      key: Date.now(),
                      kind: "find-match",
                    });
                    setTab("discover");
                  }}
                />
              )}
              {tab === "training" && (
                <PlayerTrainingScreen onBack={() => setTab("plans")} />
              )}
              <VideoStudioScreen
                active={tab === "video"}
                onCreateMatch={() => setCreateMatchOpen(true)}
                onTransferStatus={setVideoTransfer}
                runtime={runtime}
                theme={theme}
              />
              {tab === "wallet" && (
                <WalletScreen onClose={() => setTab("you")} />
              )}
              {tab === "predictions" && (
                <PredictionPortfolioScreen onBack={() => setTab("wallet")} />
              )}
              {tab === "you" && (
                <ProfileHubScreen
                  onArtwork={() => setArtworkStudioOpen(true)}
                  onDestination={(destination) => {
                    if (destination === "performance") {
                      setPerformanceReturnTab("you");
                    }
                    setTab(destination);
                  }}
                  onEditProfile={() => setProfileEditorOpen(true)}
                  onOrganization={setOrganizationSlug}
                />
              )}
              {tab === "health" && (
                <HealthScreen onBack={() => setTab("you")} theme={theme} />
              )}
              {tab === "performance" && (
                <PerformanceScreen
                  onArtwork={() => setArtworkStudioOpen(true)}
                  onBack={() => setTab(performanceReturnTab)}
                  onEditProfile={() => setProfileEditorOpen(true)}
                  onHealth={() => setTab("health")}
                  onPredictions={() => setTab("predictions")}
                  onWallet={() => setTab("wallet")}
                />
              )}
              <PlayerDunaAiScreen
                active={tab === "ai"}
                initialPrompt={aiInitialPrompt}
                onInitialPromptConsumed={() => setAiInitialPrompt(undefined)}
                onClose={() =>
                  setTab(aiReturnTab === "ai" ? "home" : aiReturnTab)
                }
                onOpenBooking={setBookingId}
                onOpenEvent={openAiEvent}
                onOpenMatch={openAiMatch}
                onOpenMessages={() => {
                  setMessagesConversationId(undefined);
                  setMessagesOpenToSupport(false);
                  setTab("messages");
                }}
                onOpenPath={openDunaHref}
                onOpenVenue={(venueId) => setOrganizationVenueId(venueId)}
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
              {tab === "messages" && (
                <PlayerMessagingScreen
                  initialConversationId={messagesConversationId}
                  initialSupport={messagesOpenToSupport}
                  onOpenDunaAi={() => {
                    setAiReturnTab("messages");
                    setTab("ai");
                  }}
                  onUnreadCountChange={setMessagingUnreadCount}
                  onClose={() => {
                    setMessagesConversationId(undefined);
                    setMessagesOpenToSupport(false);
                    setTab("home");
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
              )}
            </Animated.View>
            {videoTransfer && (
              <VideoTransferBanner
                onDismiss={() => setVideoTransfer(undefined)}
                onPress={() => {
                  setVideoTransfer(undefined);
                  setTab("video");
                }}
                status={videoTransfer}
              />
            )}
            {tab !== "messages" && tab !== "ai" && (
              <TabBar
                active={tab}
                onChange={(destination) => {
                  if (destination === "calendar") {
                    setTab("plans");
                    return;
                  }
                  if (destination === "messages") {
                    setMessagesConversationId(undefined);
                    setMessagesOpenToSupport(false);
                    setTab("messages");
                    return;
                  }
                  setTab("home");
                }}
                onDunaAi={() => {
                  setMessagesConversationId(undefined);
                  setMessagesOpenToSupport(false);
                  setAiReturnTab(tab);
                  setTab("ai");
                }}
                onQuickActions={() => setQuickActionsOpen(true)}
                unreadCount={messagingUnreadCount}
              />
            )}
            <QuickActionsSheet
              onAction={openHomeAction}
              onClose={() => setQuickActionsOpen(false)}
              visible={quickActionsOpen}
            />
            {visionRemoteToken && (runtime.publicClient ?? runtime.client) && (
              <VisionSecondScreen
                client={(runtime.publicClient ?? runtime.client)!}
                onClose={() => setVisionRemoteToken(undefined)}
                token={visionRemoteToken}
              />
            )}
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
                const index = (
                  runtime.dashboard?.events ?? demoEvents
                ).findIndex((event) => event.id === registrationEvent.id);
                if (index >= 0) {
                  setEventIndex(index);
                  return;
                }
                setRegistrationEventOverride(registrationEvent);
              }}
              onScore={() => {
                setTab("score");
              }}
              onVideo={() => {
                setTab("video");
              }}
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
                setCourtBookingRequest(request);
              }}
              visible={courtFinderOpen}
            />
            <VenueBookingModal
              initialDate={courtBookingRequest?.date}
              initialDurationMinutes={courtBookingRequest?.durationMinutes}
              initialIntent={courtBookingRequest?.intent}
              onClose={() => setCourtBookingRequest(undefined)}
              onOpenMatch={(matchId, matchSlug) => {
                const index = (runtime.dashboard?.events ?? []).findIndex(
                  (event) => event.id === matchId,
                );
                setCourtBookingRequest(undefined);
                setTimeout(() => {
                  if (index >= 0) {
                    setEventIndex(index);
                    return;
                  }
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
                  );
                }, 280);
              }}
              venueId={courtBookingRequest?.venueId}
              visible={Boolean(courtBookingRequest)}
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
                if (index >= 0) {
                  organizationTransition.schedule({
                    kind: "event",
                    eventIndex: index,
                  });
                } else {
                  organizationTransition.schedule({
                    kind: "external-event",
                    slug: eventSlug,
                  });
                }
                setOrganizationSlug(undefined);
              }}
              onOpenVenue={(venueId) => {
                organizationTransition.schedule({ kind: "venue", venueId });
                setOrganizationSlug(undefined);
              }}
              slug={organizationSlug}
              theme={theme}
            />
            <VenueBookingModal
              onClose={() => setOrganizationVenueId(undefined)}
              onOpenMatch={(matchId, matchSlug) => {
                const index = (runtime.dashboard?.events ?? []).findIndex(
                  (event) => event.id === matchId,
                );
                setOrganizationVenueId(undefined);
                setTimeout(() => {
                  if (index >= 0) {
                    setEventIndex(index);
                    return;
                  }
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
                  );
                }, 280);
              }}
              venueId={organizationVenueId}
              visible={Boolean(organizationVenueId)}
            />
            <PickupModal
              onClose={() => {
                setCreateMatchOpen(false);
              }}
              onReserveCourtVenue={(request) => {
                setCreateMatchOpen(false);
                setCourtBookingRequest(request);
              }}
              visible={createMatchOpen}
            />
            <CoachProfileModal
              coach={organizationCoach}
              onClose={() => setOrganizationCoach(undefined)}
              onOpenSession={(session) => {
                const events = runtime.dashboard?.events ?? demoEvents;
                const index = events.findIndex(
                  (event) => event.id === session.id,
                );
                if (index >= 0) {
                  openEventDetailAtIndex(index);
                  return;
                }
                void WebBrowser.openBrowserAsync(
                  `${dunaWebUrl}/events/${encodeURIComponent(session.slug)}`,
                );
              }}
            />
            <WatchScoreInbox
              onReview={(draft) => {
                setWatchScoreDraft(draft);
                setTab("score");
              }}
            />
          </View>
        </SafeAreaView>
      </PlayerProfileProvider>
    </MessagingNavigationContext.Provider>
  );
}
