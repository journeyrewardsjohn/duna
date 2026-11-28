import {
  WorkOSMobileAuthProvider,
  useWorkOSMobileAuth,
  type WorkOSMobileOrganization,
  type WorkOSMobileUser,
} from "@duna/mobile-auth";
import {
  persistableSnapshot,
  storedSnapshotHoldsCredential,
} from "./runtime-persist";
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
import { demoOrganization, demoVenues } from "@duna/core/demo";
import {
  askPlayerDunaAi,
  confirmPlayerDunaAiAction,
  createDunaApiClient,
  createPlayerMessagingDeliveryEngine,
  getPlayerDunaAiSuggestions,
  transcribeMatchJournalVoice,
  uploadPlayerMedia,
  type DunaApiClient,
  type PlayerDunaAiActionOutcome,
  type PlayerDunaAiResponse,
  type UploadedPlayerMedia,
} from "./mobile-api";
import type { DeliveryEngine } from "@duna/messaging-client";
import {
  LoadingGate,
  MessageGate,
  ReturningAccountGate,
  SignedOutGate,
} from "./src/app/AccountGate";
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
  readonly transcribeMatchJournalVoice?: (input: {
    readonly uri: string;
    readonly name?: string;
  }) => Promise<string>;
  readonly askDunaAi?: (input: {
    readonly message: string;
    readonly pathname: string;
    readonly pageTitle?: string;
    readonly history?: readonly {
      role: "assistant" | "user";
      body: string;
    }[];
  }) => Promise<PlayerDunaAiResponse>;
  readonly getDunaAiSuggestions?: (input: {
    readonly pathname: string;
    readonly pageTitle?: string;
  }) => Promise<PlayerDunaAiResponse>;
  readonly confirmDunaAiAction?: (input: {
    readonly draftId: string;
    readonly confirmationNonce?: string;
  }) => Promise<PlayerDunaAiActionOutcome>;
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

function RuntimeLoadingState() {
  return <LoadingGate />;
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
    <MessageGate
      action={action}
      body={body}
      busy={busy}
      onAction={onAction}
      title={title}
    />
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
    <SignedOutGate error={error} onSignIn={onSignIn} onSignUp={onSignUp} />
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
  return (
    <ReturningAccountGate
      busy={busy}
      error={error}
      initials={mobileUserInitials(user)}
      name={mobileUserDisplayName(user, fallbackName)}
      onContinue={onContinue}
      onUseDifferentAccount={onUseDifferentAccount}
      photoUrl={photoUrl}
    />
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
        // One-time cleanup: older snapshots kept the member credential.
        if (storedSnapshotHoldsCredential(parsed))
          void AsyncStorage.setItem(
            runtimeCacheKey,
            JSON.stringify(persistableSnapshot(parsed as object)),
          );
        if (isPlayerRuntimeSnapshot(parsed))
          applySnapshot(persistableSnapshot(parsed));
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
      void AsyncStorage.setItem(
        runtimeCacheKey,
        JSON.stringify(persistableSnapshot(snapshot)),
      );
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
        askDunaAi: (input) =>
          askPlayerDunaAi(getToken, {
            message: input.message,
            history: input.history,
            context: {
              pathname: input.pathname,
              pageTitle: input.pageTitle,
              timezone:
                dashboard?.bookings.find((booking) => booking.venueTimezone)
                  ?.venueTimezone ??
                Intl.DateTimeFormat().resolvedOptions().timeZone,
              locale: Intl.DateTimeFormat().resolvedOptions().locale,
              localTime: new Date().toISOString(),
            },
          }),
        getDunaAiSuggestions: (input) =>
          getPlayerDunaAiSuggestions(getToken, {
            pathname: input.pathname,
            pageTitle: input.pageTitle,
            timezone:
              dashboard?.bookings.find((booking) => booking.venueTimezone)
                ?.venueTimezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: Intl.DateTimeFormat().resolvedOptions().locale,
            localTime: new Date().toISOString(),
          }),
        confirmDunaAiAction: (input) =>
          confirmPlayerDunaAiAction(getToken, input),
        uploadPlayerMedia: (input) => uploadPlayerMedia(getToken, input),
        transcribeMatchJournalVoice: (input) =>
          transcribeMatchJournalVoice(getToken, input),
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
      venues: demoVenues,
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
