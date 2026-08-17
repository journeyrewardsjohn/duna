import {
  WorkOSMobileAuthProvider,
  useWorkOSMobileAuth,
  type WorkOSMobileOrganization,
} from "@duna/mobile-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import { VideoView, useVideoPlayer } from "expo-video";
import { demoOrganization } from "@duna/core/demo";
import {
  AccessibilityInfo,
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import {
  createDunaApiClient,
  createPlayerMessagingDeliveryEngine,
  uploadPlayerMedia,
  type DunaApiClient,
  type UploadedPlayerMedia,
} from "./mobile-api";
import type { DeliveryEngine } from "@duna/messaging-client";
import { SatoshiText as Text } from "./satoshi-text";
import {
  registerMessagingNotifications,
  unregisterMessagingNotifications,
} from "./messaging-notifications";

type PlayerDashboard = Awaited<
  ReturnType<DunaApiClient["player"]["dashboard"]["query"]>
>;
type PlayerWallet = Awaited<
  ReturnType<DunaApiClient["player"]["wallet"]["query"]>
>;
type PlayerMemberCard = Awaited<
  ReturnType<DunaApiClient["player"]["memberCard"]["query"]>
>;
type PredictionWallet = Awaited<
  ReturnType<DunaApiClient["player"]["predictionWallet"]["query"]>
>;
type PredictionDiscovery = Awaited<
  ReturnType<DunaApiClient["public"]["predictionDiscovery"]["query"]>
>;
type PlayerSettings = Awaited<
  ReturnType<DunaApiClient["player"]["settings"]["query"]>
>;
type PlayerCoachingNotes = Awaited<
  ReturnType<DunaApiClient["player"]["coachingNotes"]["query"]>
>;
type PublicPeople = Awaited<
  ReturnType<DunaApiClient["public"]["players"]["query"]>
>;
type PublicVenues = Awaited<
  ReturnType<DunaApiClient["public"]["venues"]["query"]>
>;
type PublicProCoverage = Awaited<
  ReturnType<DunaApiClient["public"]["proCoverage"]["query"]>
>;
type PublicCoaches = Awaited<
  ReturnType<DunaApiClient["public"]["coaches"]["query"]>
>;
type PublicDiscoveryMap = Awaited<
  ReturnType<DunaApiClient["public"]["discoveryMap"]["query"]>
>;
type OrganizationWallets = Awaited<
  ReturnType<DunaApiClient["player"]["organizationWallets"]["query"]>
>;
type PlayerOrganizationAccess = Awaited<
  ReturnType<DunaApiClient["player"]["organizationAccess"]["query"]>
>;

interface PlayerRuntimeSnapshot {
  readonly cachedAt: string;
  readonly dashboard: PlayerDashboard;
  readonly wallet: PlayerWallet;
  readonly memberCard?: PlayerMemberCard;
  readonly predictionWallet: PredictionWallet;
  readonly predictionDiscovery?: PredictionDiscovery;
  readonly settings: PlayerSettings;
  readonly coachingNotes: PlayerCoachingNotes;
  readonly people: PublicPeople;
  readonly venues: PublicVenues;
  readonly proCoverage?: PublicProCoverage;
  readonly coaches: PublicCoaches;
  readonly discoveryMap?: PublicDiscoveryMap;
  readonly organizationWallets: OrganizationWallets;
  readonly organizationAccess?: PlayerOrganizationAccess;
}

const runtimeCacheKey = "duna.player.runtime-snapshot.v1";

function isPlayerRuntimeSnapshot(
  value: unknown,
): value is PlayerRuntimeSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.cachedAt === "string" &&
    Boolean(candidate.dashboard) &&
    Boolean(candidate.wallet) &&
    Boolean(candidate.predictionWallet) &&
    Boolean(candidate.settings) &&
    Array.isArray(candidate.coachingNotes) &&
    Array.isArray(candidate.people) &&
    Array.isArray(candidate.venues) &&
    Array.isArray(candidate.coaches) &&
    Array.isArray(candidate.organizationWallets)
  );
}

export interface PlayerRuntime {
  readonly mode: "preview" | "live";
  /** A previously synced private snapshot is available without a connection. */
  readonly isOffline?: boolean;
  readonly lastSuccessfulSyncAt?: string;
  readonly client?: DunaApiClient;
  readonly messagingDelivery?: DeliveryEngine;
  readonly publicClient?: DunaApiClient;
  readonly dashboard?: PlayerDashboard;
  readonly wallet?: PlayerWallet;
  readonly memberCard?: PlayerMemberCard;
  readonly predictionWallet?: PredictionWallet;
  readonly predictionDiscovery?: PredictionDiscovery;
  readonly settings?: PlayerSettings;
  readonly coachingNotes?: PlayerCoachingNotes;
  readonly people?: PublicPeople;
  readonly venues?: PublicVenues;
  readonly proCoverage?: PublicProCoverage;
  readonly coaches?: PublicCoaches;
  readonly discoveryMap?: PublicDiscoveryMap;
  readonly organizationWallets?: OrganizationWallets;
  readonly organizationAccess?: PlayerOrganizationAccess;
  readonly authOrganizations?: readonly WorkOSMobileOrganization[];
  readonly activeAuthOrganizationId?: string;
  readonly isSwitchingOrganization?: boolean;
  readonly refresh: () => Promise<void>;
  readonly switchOrganization?: (organizationId: string) => Promise<void>;
  readonly selfEnrollOrganizationStaff?: (
    staffRole: "coach" | "director",
  ) => Promise<void>;
  readonly uploadPlayerMedia?: (input: {
    readonly uri: string;
    readonly name?: string;
    readonly type?: string;
    readonly width: number;
    readonly height: number;
  }) => Promise<UploadedPlayerMedia>;
  readonly signOut?: () => Promise<void>;
}

const RuntimeContext = createContext<PlayerRuntime | undefined>(undefined);
const workosClientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID?.trim();
const authBaseUrl = (
  process.env.EXPO_PUBLIC_DUNA_AUTH_URL?.trim() ||
  process.env.EXPO_PUBLIC_DUNA_WEB_URL?.trim() ||
  "https://duna.coach"
).replace(/\/+$/, "");
const previewEnabled = process.env.EXPO_PUBLIC_DUNA_PREVIEW === "true";
// Metro requires static module references so both hero assets ship in the native bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaHeroVideo = require("./assets/duna-hero.mp4");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaHeroPoster = require("./assets/duna-hero-poster.jpg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaLaunchVideo = require("./assets/duna-launch.mp4");

function RuntimeLoadingState() {
  const player = useVideoPlayer(dunaLaunchVideo, (nextPlayer) => {
    nextPlayer.loop = true;
    // First open is handled by PlayerLaunchExperience, where the film plays
    // with sound and haptics. Runtime retries stay quiet so a network refresh
    // never starts speaking over the player unexpectedly.
    nextPlayer.muted = true;
    nextPlayer.play();
  });

  return (
    <View
      accessibilityLabel="Loading Duna"
      accessibilityRole="progressbar"
      style={runtimeStyles.loadingScreen}
    >
      <VideoView
        contentFit="cover"
        nativeControls={false}
        player={player}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={runtimeStyles.loadingCopy}>
        <Text style={runtimeStyles.loadingTitle}>Loading Your World</Text>
        <Text style={runtimeStyles.loadingBody}>
          Syncing your bookings, matches, wallet, and profile.
        </Text>
      </View>
    </View>
  );
}

function RuntimeMark({
  color,
  size,
}: {
  readonly color: string;
  readonly size: number;
}) {
  return (
    <Svg height={size * 0.75} viewBox="0 0 64 48" width={size}>
      <Line
        opacity={0.38}
        stroke={color}
        strokeLinecap="round"
        strokeWidth="1.5"
        x1="5"
        x2="59"
        y1="34"
        y2="34"
      />
      <Path
        d="M6 36.5C17.5 36.5 22.4 31.7 29.2 26.3C36.3 20.7 45 18.4 58 11.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.5"
      />
    </Svg>
  );
}

function CenteredState({
  title,
  body,
  action,
  onAction,
  busy = false,
}: {
  readonly title: string;
  readonly body: string;
  readonly action?: string;
  readonly onAction?: () => void;
  readonly busy?: boolean;
}) {
  return (
    <View style={runtimeStyles.state}>
      <RuntimeMark color="#3d6672" size={56} />
      <Text style={runtimeStyles.wordmark}>DUNA</Text>
      <Text style={runtimeStyles.title}>{title}</Text>
      <Text style={runtimeStyles.body}>{body}</Text>
      {busy && <ActivityIndicator color="#d4b77c" size="small" />}
      {action && onAction && (
        <Pressable onPress={onAction} style={runtimeStyles.button}>
          <Text style={runtimeStyles.buttonText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SignedOutState({
  error,
  onSignIn,
}: {
  readonly error?: string;
  readonly onSignIn: () => void;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const player = useVideoPlayer(dunaHeroVideo, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    nextPlayer.play();
  });

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) player.pause();
    else player.play();
  }, [player, reduceMotion]);

  const start = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => undefined,
    );
    onSignIn();
  }, [onSignIn]);

  return (
    <ImageBackground
      resizeMode="cover"
      source={dunaHeroPoster}
      style={runtimeStyles.entry}
    >
      {!reduceMotion && (
        <VideoView
          contentFit="cover"
          nativeControls={false}
          player={player}
          style={runtimeStyles.entryVideo}
        />
      )}
      <View pointerEvents="none" style={runtimeStyles.entryWash} />
      <View pointerEvents="none" style={runtimeStyles.entryGrain} />

      <View style={runtimeStyles.entryTop}>
        <View style={runtimeStyles.entryBrand}>
          <RuntimeMark color="#ffffff" size={36} />
          <Text style={runtimeStyles.entryWordmark}>DUNA</Text>
        </View>
        <Text style={runtimeStyles.entryEyebrow}>THE HOME OF YOUR GAME</Text>
      </View>

      <View style={runtimeStyles.entryBottom}>
        <Text style={runtimeStyles.entryTitle}>
          Find your people.{"\n"}Know your game.
        </Text>
        <Text style={runtimeStyles.entryBody}>
          Book the court, join what is next, and carry every verified result
          with you.
        </Text>

        <View style={runtimeStyles.entryBenefits}>
          <View style={runtimeStyles.entryBenefit}>
            <Text style={runtimeStyles.entryBenefitLabel}>PLAY</Text>
            <Text style={runtimeStyles.entryBenefitValue}>Courts + people</Text>
          </View>
          <View style={runtimeStyles.entryBenefit}>
            <Text style={runtimeStyles.entryBenefitLabel}>TRACK</Text>
            <Text style={runtimeStyles.entryBenefitValue}>
              Verified results
            </Text>
          </View>
          <View style={runtimeStyles.entryBenefit}>
            <Text style={runtimeStyles.entryBenefitLabel}>BELONG</Text>
            <Text style={runtimeStyles.entryBenefitValue}>One identity</Text>
          </View>
        </View>

        {error && <Text style={runtimeStyles.entryError}>{error}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={start}
          style={({ pressed }) => [
            runtimeStyles.entryButton,
            pressed && runtimeStyles.entryButtonPressed,
          ]}
        >
          <Text style={runtimeStyles.entryButtonText}>Start with Duna</Text>
          <Text style={runtimeStyles.entryButtonArrow}>→</Text>
        </Pressable>
        <Text style={runtimeStyles.entryFootnote}>
          Secure sign-in · One account for web + mobile
        </Text>
      </View>
    </ImageBackground>
  );
}

function ConnectedRuntime({ children }: { readonly children: ReactNode }) {
  const {
    error: authError,
    getToken,
    isLoaded,
    isSignedIn,
    isSwitchingOrganization,
    organizationId,
    organizations,
    selectOrganization,
    signIn,
    signOut,
  } = useWorkOSMobileAuth();
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const messagingDelivery = useMemo(
    () => createPlayerMessagingDeliveryEngine(getToken),
    [getToken],
  );
  const safeSignOut = useCallback(async () => {
    await unregisterMessagingNotifications(client).catch(() => undefined);
    await AsyncStorage.removeItem(runtimeCacheKey).catch(() => undefined);
    await signOut();
  }, [client, signOut]);
  const [dashboard, setDashboard] = useState<PlayerDashboard>();
  const [wallet, setWallet] = useState<PlayerWallet>();
  const [memberCard, setMemberCard] = useState<PlayerMemberCard>();
  const [predictionWallet, setPredictionWallet] = useState<PredictionWallet>();
  const [predictionDiscovery, setPredictionDiscovery] =
    useState<PredictionDiscovery>();
  const [settings, setSettings] = useState<PlayerSettings>();
  const [coachingNotes, setCoachingNotes] = useState<PlayerCoachingNotes>();
  const [people, setPeople] = useState<PublicPeople>();
  const [venues, setVenues] = useState<PublicVenues>();
  const [proCoverage, setProCoverage] = useState<PublicProCoverage>();
  const [coaches, setCoaches] = useState<PublicCoaches>();
  const [discoveryMap, setDiscoveryMap] = useState<PublicDiscoveryMap>();
  const [organizationWallets, setOrganizationWallets] =
    useState<OrganizationWallets>();
  const [organizationAccess, setOrganizationAccess] =
    useState<PlayerOrganizationAccess>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string>();

  const applySnapshot = useCallback((snapshot: PlayerRuntimeSnapshot) => {
    setDashboard(snapshot.dashboard);
    setWallet(snapshot.wallet);
    setMemberCard(snapshot.memberCard);
    setPredictionWallet(snapshot.predictionWallet);
    setPredictionDiscovery(snapshot.predictionDiscovery);
    setSettings(snapshot.settings);
    setCoachingNotes(snapshot.coachingNotes);
    setPeople(snapshot.people);
    setVenues(snapshot.venues);
    setProCoverage(snapshot.proCoverage);
    setCoaches(snapshot.coaches);
    setDiscoveryMap(snapshot.discoveryMap);
    setOrganizationWallets(snapshot.organizationWallets);
    setOrganizationAccess(snapshot.organizationAccess);
    setLastSuccessfulSyncAt(snapshot.cachedAt);
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(runtimeCacheKey)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as unknown;
        if (isPlayerRuntimeSnapshot(parsed)) applySnapshot(parsed);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCacheHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [applySnapshot]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [
        nextDashboard,
        nextWallet,
        nextMemberCard,
        nextPredictionWallet,
        nextPredictionDiscovery,
        nextSettings,
        nextCoachingNotes,
        nextPeople,
        nextVenues,
        nextProCoverage,
        nextCoaches,
        nextDiscoveryMap,
        nextOrganizationWallets,
        nextOrganizationAccess,
      ] = await Promise.all([
        client.player.dashboard.query(),
        client.player.wallet.query(),
        client.player.memberCard.query().catch(() => undefined),
        client.player.predictionWallet.query(),
        client.public.predictionDiscovery
          .query({ limit: 8 })
          .catch(() => undefined),
        client.player.settings.query(),
        client.player.coachingNotes.query().catch(() => []),
        client.public.players.query({ limit: 50 }).catch(() => []),
        client.public.venues.query().catch(() => []),
        client.public.proCoverage.query().catch(() => undefined),
        client.public.coaches.query().catch(() => []),
        client.public.discoveryMap.query().catch(() => undefined),
        client.player.organizationWallets.query().catch(() => []),
        client.player.organizationAccess.query().catch(() => undefined),
      ]);
      const snapshot: PlayerRuntimeSnapshot = {
        cachedAt: new Date().toISOString(),
        dashboard: nextDashboard,
        wallet: nextWallet,
        memberCard: nextMemberCard,
        predictionWallet: nextPredictionWallet,
        predictionDiscovery: nextPredictionDiscovery,
        settings: nextSettings,
        coachingNotes: nextCoachingNotes,
        people: nextPeople,
        venues: nextVenues,
        proCoverage: nextProCoverage,
        coaches: nextCoaches,
        discoveryMap: nextDiscoveryMap,
        organizationWallets: nextOrganizationWallets,
        organizationAccess: nextOrganizationAccess,
      };
      applySnapshot(snapshot);
      setIsOffline(false);
      void AsyncStorage.setItem(runtimeCacheKey, JSON.stringify(snapshot));
    } catch (reason) {
      const state = await Network.getNetworkStateAsync().catch(() => undefined);
      setIsOffline(
        Boolean(!state?.isConnected || state?.isInternetReachable === false),
      );
      setError(
        reason instanceof Error && /abort|timed? out/i.test(reason.message)
          ? "Duna took too long to reach the secure account service. Check your connection and try again."
          : reason instanceof Error
            ? reason.message
            : "Duna could not load your account.",
      );
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, client]);

  const switchOrganization = useCallback(
    async (nextOrganizationId: string) => {
      await selectOrganization(nextOrganizationId);
      await refresh();
    },
    [refresh, selectOrganization],
  );

  const selfEnrollOrganizationStaff = useCallback(
    async (staffRole: "coach" | "director") => {
      await client.player.selfEnrollOrganizationStaff.mutate({
        idempotencyKey: Crypto.randomUUID(),
        staffRole,
      });
      await refresh();
    },
    [client, refresh],
  );

  useEffect(() => {
    if (isLoaded && isSignedIn && cacheHydrated) void refresh();
  }, [cacheHydrated, isLoaded, isSignedIn, refresh]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void refresh();
      } else {
        setIsOffline(true);
      }
    });
    return () => subscription.remove();
  }, [isLoaded, isSignedIn, refresh]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void registerMessagingNotifications(client, false).catch(() => undefined);
  }, [client, isLoaded, isSignedIn]);

  if (!isLoaded) {
    return <RuntimeLoadingState />;
  }
  if (!isSignedIn) {
    return <SignedOutState error={authError} onSignIn={() => void signIn()} />;
  }
  if (!cacheHydrated || (loading && !dashboard)) {
    return <RuntimeLoadingState />;
  }
  const hasUsableSnapshot = Boolean(
    dashboard &&
    wallet &&
    predictionWallet &&
    settings &&
    coachingNotes &&
    people &&
    venues &&
    coaches &&
    organizationWallets,
  );
  if (!hasUsableSnapshot) {
    return (
      <CenteredState
        action="Try again"
        body={error ?? "Your account data is not available yet."}
        onAction={() => void refresh()}
        title="We could not finish syncing"
      />
    );
  }

  return (
    <RuntimeContext.Provider
      value={{
        mode: "live",
        isOffline,
        lastSuccessfulSyncAt,
        client,
        messagingDelivery,
        publicClient: client,
        dashboard,
        wallet,
        memberCard,
        predictionWallet,
        predictionDiscovery,
        settings,
        coachingNotes,
        people,
        venues,
        proCoverage,
        coaches,
        discoveryMap,
        organizationWallets,
        organizationAccess,
        authOrganizations: organizations,
        activeAuthOrganizationId: organizationId,
        isSwitchingOrganization,
        refresh,
        switchOrganization,
        selfEnrollOrganizationStaff,
        uploadPlayerMedia: (input) => uploadPlayerMedia(getToken, input),
        signOut: safeSignOut,
      }}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

function PreviewRuntime({ children }: { readonly children: ReactNode }) {
  const publicClient = useMemo(() => createDunaApiClient(async () => null), []);
  const [proCoverage, setProCoverage] = useState<PublicProCoverage>();
  const [discoveryMap, setDiscoveryMap] = useState<PublicDiscoveryMap>();
  const [predictionDiscovery, setPredictionDiscovery] =
    useState<PredictionDiscovery>();
  useEffect(() => {
    let active = true;
    void publicClient.public.proCoverage
      .query()
      .then((coverage) => {
        if (active) setProCoverage(coverage);
      })
      .catch(() => undefined);
    void publicClient.public.discoveryMap
      .query()
      .then((map) => {
        if (active) setDiscoveryMap(map);
      })
      .catch(() => undefined);
    void publicClient.public.predictionDiscovery
      .query({ limit: 8 })
      .then((discovery) => {
        if (active) setPredictionDiscovery(discovery);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [publicClient]);
  const value = useMemo<PlayerRuntime>(
    () => ({
      mode: "preview",
      publicClient,
      proCoverage,
      discoveryMap,
      predictionDiscovery,
      activeAuthOrganizationId: "org_demo_south_bay",
      authOrganizations: [
        {
          id: "org_demo_south_bay",
          name: demoOrganization.name,
          role: "admin",
        },
        {
          id: "org_demo_beach_collective",
          name: "Beach Collective",
          role: "coach",
        },
      ],
      organizationAccess: {
        activeOrganizationId: demoOrganization.id,
        organizations: [
          {
            id: demoOrganization.id,
            slug: demoOrganization.slug,
            name: demoOrganization.name,
            roles: ["manager", "coach"],
            isActive: true,
            canManage: true,
            canSelfEnroll: false,
            staff: { active: true, role: "director" },
          },
        ],
      },
      refresh: async () => undefined,
    }),
    [discoveryMap, predictionDiscovery, proCoverage],
  );
  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}

export function PlayerRuntimeProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  if (!workosClientId) {
    if (previewEnabled) return <PreviewRuntime>{children}</PreviewRuntime>;
    return (
      <CenteredState
        body="This build needs the WorkOS client identifier before secure sign-in can begin."
        title="Identity setup required"
      />
    );
  }
  return (
    <WorkOSMobileAuthProvider
      authBaseUrl={authBaseUrl}
      clientId={workosClientId}
      scheme="duna"
    >
      <ConnectedRuntime>{children}</ConnectedRuntime>
    </WorkOSMobileAuthProvider>
  );
}

export function usePlayerRuntime(): PlayerRuntime {
  const value = useContext(RuntimeContext);
  if (!value) {
    throw new Error(
      "usePlayerRuntime must be used inside PlayerRuntimeProvider",
    );
  }
  return value;
}

const runtimeStyles = StyleSheet.create({
  auth: { backgroundColor: "#f6f5f1", flex: 1 },
  body: {
    color: "#657083",
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 340,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#3d6672",
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  entry: {
    backgroundColor: "#0d1114",
    flex: 1,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  loadingBody: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: "center",
  },
  loadingCopy: {
    alignItems: "center",
    bottom: "10%",
    left: 24,
    position: "absolute",
    right: 24,
  },
  loadingScreen: {
    backgroundColor: "#06233D",
    flex: 1,
    overflow: "hidden",
  },
  loadingTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: -0.45,
    marginBottom: 8,
  },
  entryBenefit: {
    borderColor: "rgba(255,255,255,0.24)",
    borderLeftWidth: 1,
    flex: 1,
    gap: 5,
    paddingLeft: 12,
  },
  entryBenefitLabel: {
    color: "#dfe5e4",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  entryBenefitValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  entryBenefits: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 22,
    marginTop: 24,
  },
  entryBody: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 360,
  },
  entryBottom: {
    paddingBottom: 30,
    paddingHorizontal: 24,
    zIndex: 4,
  },
  entryBrand: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  entryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 21,
  },
  entryButtonArrow: {
    color: "#101a20",
    fontSize: 22,
    fontWeight: "500",
  },
  entryButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  entryButtonText: {
    color: "#101a20",
    fontSize: 16,
    fontWeight: "900",
  },
  entryError: {
    color: "#ffd9cc",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  entryEyebrow: {
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 999,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.3,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  entryFootnote: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  entryGrain: {
    backgroundColor: "rgba(255,255,255,0.025)",
    bottom: 0,
    left: 0,
    opacity: 0.9,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  entryTitle: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.7,
    lineHeight: 44,
    maxWidth: 390,
  },
  entryTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 58,
    zIndex: 4,
  },
  entryVideo: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  entryWash: {
    backgroundColor: "rgba(4,16,28,0.48)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  entryWordmark: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 3.6,
  },
  state: {
    alignItems: "center",
    backgroundColor: "#f6f5f1",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28,
  },
  title: {
    color: "#101a20",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 8,
    textAlign: "center",
  },
  wordmark: {
    color: "#101a20",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 4,
  },
});
