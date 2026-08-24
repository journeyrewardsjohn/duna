import {
  WorkOSMobileAuthProvider,
  useWorkOSMobileAuth,
  type WorkOSMobileOrganization,
  type WorkOSMobileUser,
} from "@duna/mobile-auth";
import {
  mobileUserDisplayName,
  mobileUserInitials,
} from "@duna/mobile-auth/identity";
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
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import { StatusBar } from "expo-status-bar";
import { demoOrganization } from "@duna/core/demo";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
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
type PlayerVirtualSessions = Awaited<
  ReturnType<DunaApiClient["player"]["virtualSessions"]["query"]>
>;
export type PlayerTrainingWorkspace = Awaited<
  ReturnType<DunaApiClient["player"]["trainingWorkspace"]["query"]>
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
type PlayerPaymentSchedules = Awaited<
  ReturnType<DunaApiClient["player"]["paymentSchedules"]["query"]>
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
  readonly virtualSessions: PlayerVirtualSessions;
  readonly training?: PlayerTrainingWorkspace;
  readonly people: PublicPeople;
  readonly venues: PublicVenues;
  readonly proCoverage?: PublicProCoverage;
  readonly coaches: PublicCoaches;
  readonly discoveryMap?: PublicDiscoveryMap;
  readonly organizationWallets: OrganizationWallets;
  readonly paymentSchedules: PlayerPaymentSchedules;
  readonly organizationAccess?: PlayerOrganizationAccess;
}

const runtimeCacheKey = "duna.player.runtime-snapshot.v2";

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
    Array.isArray(candidate.virtualSessions) &&
    Array.isArray(candidate.people) &&
    Array.isArray(candidate.venues) &&
    Array.isArray(candidate.coaches) &&
    Array.isArray(candidate.organizationWallets) &&
    Array.isArray(candidate.paymentSchedules)
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
  readonly virtualSessions?: PlayerVirtualSessions;
  readonly training?: PlayerTrainingWorkspace;
  readonly people?: PublicPeople;
  readonly venues?: PublicVenues;
  readonly proCoverage?: PublicProCoverage;
  readonly coaches?: PublicCoaches;
  readonly discoveryMap?: PublicDiscoveryMap;
  readonly organizationWallets?: OrganizationWallets;
  readonly paymentSchedules?: PlayerPaymentSchedules;
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaHeroPoster = require("./assets/duna-hero-poster.jpg");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaMark = require("./assets/duna-mark.png");

function RuntimeLoadingState() {
  return (
    <View
      accessibilityLabel="Loading Duna"
      accessibilityRole="progressbar"
      style={runtimeStyles.loadingScreen}
    >
      <StatusBar style="dark" />
      <ActivityIndicator color="#1B1B19" size="small" />
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

function WelcomeWash() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="welcome-wash" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#071625" stopOpacity="0.04" />
          <Stop offset="0.42" stopColor="#071625" stopOpacity="0.12" />
          <Stop offset="0.7" stopColor="#071625" stopOpacity="0.74" />
          <Stop offset="1" stopColor="#071625" stopOpacity="0.98" />
        </SvgLinearGradient>
      </Defs>
      <Rect fill="url(#welcome-wash)" height="100%" width="100%" />
    </Svg>
  );
}

function AccountContours() {
  return (
    <Svg
      pointerEvents="none"
      style={runtimeStyles.accountContours}
      viewBox="0 0 402 300"
    >
      {[
        "M-20 96C72 52 132 72 202 122C278 176 340 168 430 112",
        "M-24 136C65 94 132 106 196 154C272 212 350 202 430 148",
        "M-18 178C58 142 120 144 190 194C266 250 344 246 430 190",
        "M-16 224C60 190 132 188 202 234C278 282 346 280 430 232",
      ].map((path) => (
        <Path
          d={path}
          fill="none"
          key={path}
          opacity={0.5}
          stroke="#E6D6BA"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

function SignedOutState({
  error,
  onSignIn,
  onSignUp,
}: {
  readonly error?: string;
  readonly onSignIn: () => void;
  readonly onSignUp: () => void;
}) {
  return (
    <ImageBackground
      resizeMode="cover"
      source={dunaHeroPoster}
      style={runtimeStyles.entry}
    >
      <StatusBar style="light" />
      <WelcomeWash />
      <View style={runtimeStyles.entryBrand}>
        <Image
          resizeMode="contain"
          source={dunaMark}
          style={runtimeStyles.entryMark}
        />
        <Text style={runtimeStyles.entryWordmark}>DUNA</Text>
      </View>
      <View style={runtimeStyles.entryContent}>
        <Text style={runtimeStyles.entryBody}>
          Join Duna free. Find games worldwide. Track your rating, study your
          film, train with the best.
        </Text>
        {error && <Text style={runtimeStyles.entryError}>{error}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={onSignUp}
          style={({ pressed }) => [
            runtimeStyles.entryPrimaryButton,
            pressed && runtimeStyles.buttonPressed,
          ]}
        >
          <Text style={runtimeStyles.entryPrimaryText}>
            Create your free account
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={({ pressed }) => [
            runtimeStyles.entrySecondaryButton,
            pressed && runtimeStyles.buttonPressed,
          ]}
        >
          <Text style={runtimeStyles.entrySecondaryText}>Log in to Duna</Text>
        </Pressable>
        <Text style={runtimeStyles.entryFootnote}>
          Already a Duna Member?{"\n"}Use the same email or phone number to log
          in.
        </Text>
      </View>
    </ImageBackground>
  );
}

function ReturningAccountState({
  busy,
  error,
  fallbackName,
  onContinue,
  onUseDifferentAccount,
  photoUrl,
  user,
}: {
  readonly busy: boolean;
  readonly error?: string;
  readonly fallbackName?: string;
  readonly onContinue: () => void;
  readonly onUseDifferentAccount: () => void;
  readonly photoUrl?: string;
  readonly user?: WorkOSMobileUser;
}) {
  const name = mobileUserDisplayName(user, fallbackName);
  return (
    <View style={runtimeStyles.accountScreen}>
      <StatusBar style="dark" />
      <AccountContours />
      <View style={runtimeStyles.accountIdentity}>
        <Text style={runtimeStyles.accountKicker}>LOG IN AS</Text>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={runtimeStyles.accountPhoto}
          />
        ) : (
          <View style={runtimeStyles.accountInitials}>
            <Text style={runtimeStyles.accountInitialsText}>
              {mobileUserInitials(user)}
            </Text>
          </View>
        )}
        <Text numberOfLines={2} style={runtimeStyles.accountName}>
          {name}
        </Text>
      </View>
      <View style={runtimeStyles.accountActions}>
        {error && <Text style={runtimeStyles.accountError}>{error}</Text>}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onContinue}
          style={({ pressed }) => [
            runtimeStyles.accountContinue,
            pressed && runtimeStyles.buttonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={runtimeStyles.accountContinueText}>Continue</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onUseDifferentAccount}
          style={runtimeStyles.accountDifferent}
        >
          <Text style={runtimeStyles.accountDifferentText}>
            USE A DIFFERENT ACCOUNT
          </Text>
        </Pressable>
      </View>
    </View>
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
    signUp,
    signOut,
    user,
  } = useWorkOSMobileAuth();
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const messagingDelivery = useMemo(
    () => createPlayerMessagingDeliveryEngine(getToken),
    [getToken],
  );
  const safeSignOut = useCallback(async () => {
    setContinueRequested(false);
    await unregisterMessagingNotifications(client).catch(() => undefined);
    await AsyncStorage.removeItem(runtimeCacheKey).catch(() => undefined);
    await signOut();
  }, [client, signOut]);
  const [continueRequested, setContinueRequested] = useState(false);
  const [dashboard, setDashboard] = useState<PlayerDashboard>();
  const [wallet, setWallet] = useState<PlayerWallet>();
  const [memberCard, setMemberCard] = useState<PlayerMemberCard>();
  const [predictionWallet, setPredictionWallet] = useState<PredictionWallet>();
  const [predictionDiscovery, setPredictionDiscovery] =
    useState<PredictionDiscovery>();
  const [settings, setSettings] = useState<PlayerSettings>();
  const [coachingNotes, setCoachingNotes] = useState<PlayerCoachingNotes>();
  const [virtualSessions, setVirtualSessions] =
    useState<PlayerVirtualSessions>();
  const [training, setTraining] = useState<PlayerTrainingWorkspace>();
  const [people, setPeople] = useState<PublicPeople>();
  const [venues, setVenues] = useState<PublicVenues>();
  const [proCoverage, setProCoverage] = useState<PublicProCoverage>();
  const [coaches, setCoaches] = useState<PublicCoaches>();
  const [discoveryMap, setDiscoveryMap] = useState<PublicDiscoveryMap>();
  const [organizationWallets, setOrganizationWallets] =
    useState<OrganizationWallets>();
  const [paymentSchedules, setPaymentSchedules] =
    useState<PlayerPaymentSchedules>();
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
    setVirtualSessions(snapshot.virtualSessions);
    setTraining(snapshot.training);
    setPeople(snapshot.people);
    setVenues(snapshot.venues);
    setProCoverage(snapshot.proCoverage);
    setCoaches(snapshot.coaches);
    setDiscoveryMap(snapshot.discoveryMap);
    setOrganizationWallets(snapshot.organizationWallets);
    setPaymentSchedules(snapshot.paymentSchedules);
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
        nextVirtualSessions,
        nextTraining,
        nextPeople,
        nextVenues,
        nextProCoverage,
        nextCoaches,
        nextDiscoveryMap,
        nextOrganizationWallets,
        nextPaymentSchedules,
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
        client.player.virtualSessions.query().catch(() => []),
        client.player.trainingWorkspace.query().catch(() => undefined),
        client.public.players.query({ limit: 50 }).catch(() => []),
        client.public.venues.query().catch(() => []),
        client.public.proCoverage.query().catch(() => undefined),
        client.public.coaches.query().catch(() => []),
        client.public.discoveryMap.query().catch(() => undefined),
        client.player.organizationWallets.query().catch(() => []),
        client.player.paymentSchedules.query().catch(() => []),
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
        virtualSessions: nextVirtualSessions,
        training: nextTraining,
        people: nextPeople,
        venues: nextVenues,
        proCoverage: nextProCoverage,
        coaches: nextCoaches,
        discoveryMap: nextDiscoveryMap,
        organizationWallets: nextOrganizationWallets,
        paymentSchedules: nextPaymentSchedules,
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

  useEffect(() => {
    if (!isSignedIn) setContinueRequested(false);
  }, [isSignedIn]);

  const hasUsableSnapshot = Boolean(
    dashboard &&
    wallet &&
    predictionWallet &&
    settings &&
    coachingNotes &&
    virtualSessions &&
    people &&
    venues &&
    coaches &&
    organizationWallets &&
    paymentSchedules,
  );

  if (!isLoaded) {
    return <RuntimeLoadingState />;
  }
  if (!isSignedIn) {
    return (
      <SignedOutState
        error={authError}
        onSignIn={() => void signIn()}
        onSignUp={() => void signUp()}
      />
    );
  }
  const preparingAccount = !cacheHydrated || (loading && !dashboard);
  if (!continueRequested || preparingAccount) {
    return (
      <ReturningAccountState
        busy={continueRequested && preparingAccount}
        error={!loading && !hasUsableSnapshot ? error : undefined}
        fallbackName={dashboard?.player.displayName}
        onContinue={() => {
          if (error && !loading) void refresh();
          setContinueRequested(true);
        }}
        onUseDifferentAccount={() => void safeSignOut()}
        photoUrl={dashboard?.player.avatarUrl ?? user?.profilePictureUrl}
        user={user}
      />
    );
  }
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
        virtualSessions,
        training,
        people,
        venues,
        proCoverage,
        coaches,
        discoveryMap,
        organizationWallets,
        paymentSchedules,
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
    backgroundColor: "#071625",
    flex: 1,
    overflow: "hidden",
  },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
  },
  entryBody: {
    alignSelf: "center",
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 60,
    maxWidth: 310,
    textAlign: "center",
  },
  entryBrand: {
    alignItems: "center",
    left: 20,
    position: "absolute",
    right: 20,
    top: "18%",
    zIndex: 2,
  },
  entryContent: {
    bottom: 30,
    left: 25,
    position: "absolute",
    right: 25,
    zIndex: 2,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  entryError: {
    color: "#ffd9cc",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 15,
    textAlign: "center",
  },
  entryFootnote: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 15,
    textAlign: "center",
  },
  entryMark: { height: 135, width: 125 },
  entryPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 25,
    justifyContent: "center",
    minHeight: 50,
  },
  entryPrimaryText: { color: "#1B1B19", fontSize: 14, fontWeight: "500" },
  entrySecondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 25,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 50,
  },
  entrySecondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  entryWordmark: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "500",
    letterSpacing: 9,
    marginLeft: 9,
    marginTop: 8,
  },
  accountActions: {
    bottom: 35,
    left: 30,
    position: "absolute",
    right: 30,
  },
  accountContinue: {
    alignItems: "center",
    backgroundColor: "#080808",
    borderRadius: 30,
    justifyContent: "center",
    minHeight: 60,
  },
  accountContinueText: { color: "#FFFFFF", fontSize: 16, fontWeight: "500" },
  accountContours: {
    bottom: 0,
    height: 300,
    left: 0,
    position: "absolute",
    right: 0,
  },
  accountDifferent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  accountDifferentText: {
    color: "#8B8984",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.8,
  },
  accountError: {
    color: "#A54332",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    textAlign: "center",
  },
  accountIdentity: {
    alignItems: "center",
    left: 20,
    position: "absolute",
    right: 20,
    top: "31%",
  },
  accountInitials: {
    alignItems: "center",
    backgroundColor: "#F0E9DD",
    borderRadius: 46,
    height: 92,
    justifyContent: "center",
    marginBottom: 20,
    width: 92,
  },
  accountInitialsText: { color: "#A48C67", fontSize: 28, fontWeight: "500" },
  accountKicker: {
    color: "#9A9791",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 3.5,
    marginBottom: 25,
  },
  accountName: {
    color: "#5F5969",
    fontSize: 36,
    fontWeight: "300",
    letterSpacing: -0.7,
    lineHeight: 42,
    textAlign: "center",
  },
  accountPhoto: {
    borderRadius: 46,
    height: 92,
    marginBottom: 20,
    width: 92,
  },
  accountScreen: {
    backgroundColor: "#FFFFFF",
    flex: 1,
    overflow: "hidden",
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
