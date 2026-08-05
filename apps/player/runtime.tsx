import {
  WorkOSMobileAuthProvider,
  useWorkOSMobileAuth,
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
import * as Haptics from "expo-haptics";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  AccessibilityInfo,
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { createDunaApiClient, type DunaApiClient } from "./mobile-api";
import { FellixText as Text } from "./fellix-text";

type PlayerDashboard = Awaited<
  ReturnType<DunaApiClient["player"]["dashboard"]["query"]>
>;
type PlayerWallet = Awaited<
  ReturnType<DunaApiClient["player"]["wallet"]["query"]>
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
type OrganizationWallets = Awaited<
  ReturnType<DunaApiClient["player"]["organizationWallets"]["query"]>
>;

export interface PlayerRuntime {
  readonly mode: "preview" | "live";
  readonly client?: DunaApiClient;
  readonly publicClient?: DunaApiClient;
  readonly dashboard?: PlayerDashboard;
  readonly wallet?: PlayerWallet;
  readonly settings?: PlayerSettings;
  readonly coachingNotes?: PlayerCoachingNotes;
  readonly people?: PublicPeople;
  readonly venues?: PublicVenues;
  readonly proCoverage?: PublicProCoverage;
  readonly coaches?: PublicCoaches;
  readonly organizationWallets?: OrganizationWallets;
  readonly refresh: () => Promise<void>;
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
      <View style={runtimeStyles.mark}>
        <View style={runtimeStyles.markArc} />
        <View style={runtimeStyles.markDot} />
      </View>
      <Text style={runtimeStyles.wordmark}>DUNA</Text>
      <Text style={runtimeStyles.title}>{title}</Text>
      <Text style={runtimeStyles.body}>{body}</Text>
      {busy && <ActivityIndicator color="#63e3db" size="small" />}
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
          <View style={runtimeStyles.entryBrandMark}>
            <View style={runtimeStyles.entryBrandArc} />
          </View>
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
    signIn,
    signOut,
  } = useWorkOSMobileAuth();
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const [dashboard, setDashboard] = useState<PlayerDashboard>();
  const [wallet, setWallet] = useState<PlayerWallet>();
  const [settings, setSettings] = useState<PlayerSettings>();
  const [coachingNotes, setCoachingNotes] = useState<PlayerCoachingNotes>();
  const [people, setPeople] = useState<PublicPeople>();
  const [venues, setVenues] = useState<PublicVenues>();
  const [proCoverage, setProCoverage] = useState<PublicProCoverage>();
  const [coaches, setCoaches] = useState<PublicCoaches>();
  const [organizationWallets, setOrganizationWallets] =
    useState<OrganizationWallets>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [
        nextDashboard,
        nextWallet,
        nextSettings,
        nextCoachingNotes,
        nextPeople,
        nextVenues,
        nextProCoverage,
        nextCoaches,
        nextOrganizationWallets,
      ] = await Promise.all([
        client.player.dashboard.query(),
        client.player.wallet.query(),
        client.player.settings.query(),
        client.player.coachingNotes.query().catch(() => []),
        client.public.players.query({ limit: 50 }).catch(() => []),
        client.public.venues.query().catch(() => []),
        client.public.proCoverage.query().catch(() => undefined),
        client.public.coaches.query().catch(() => []),
        client.player.organizationWallets.query().catch(() => []),
      ]);
      setDashboard(nextDashboard);
      setWallet(nextWallet);
      setSettings(nextSettings);
      setCoachingNotes(nextCoachingNotes);
      setPeople(nextPeople);
      setVenues(nextVenues);
      setProCoverage(nextProCoverage);
      setCoaches(nextCoaches);
      setOrganizationWallets(nextOrganizationWallets);
    } catch (reason) {
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
  }, [client]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  if (!isLoaded) {
    return (
      <CenteredState
        body="Restoring your encrypted session."
        busy
        title="Opening Duna"
      />
    );
  }
  if (!isSignedIn) {
    return <SignedOutState error={authError} onSignIn={() => void signIn()} />;
  }
  if (loading && !dashboard) {
    return (
      <CenteredState
        body="Syncing your bookings, matches, wallet, and profile."
        busy
        title="Loading your world"
      />
    );
  }
  if (
    error ||
    !dashboard ||
    !wallet ||
    !settings ||
    !coachingNotes ||
    !people ||
    !venues ||
    !coaches ||
    !organizationWallets
  ) {
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
        client,
        publicClient: client,
        dashboard,
        wallet,
        settings,
        coachingNotes,
        people,
        venues,
        proCoverage,
        coaches,
        organizationWallets,
        refresh,
        signOut,
      }}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

function PreviewRuntime({ children }: { readonly children: ReactNode }) {
  const publicClient = useMemo(() => createDunaApiClient(async () => null), []);
  const [proCoverage, setProCoverage] = useState<PublicProCoverage>();
  useEffect(() => {
    let active = true;
    void publicClient.public.proCoverage
      .query()
      .then((coverage) => {
        if (active) setProCoverage(coverage);
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
      refresh: async () => undefined,
    }),
    [proCoverage],
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
  auth: { backgroundColor: "#f8f7f3", flex: 1 },
  body: {
    color: "#657083",
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 340,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2367a8",
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  entry: {
    backgroundColor: "#07182a",
    flex: 1,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  entryBenefit: {
    borderColor: "rgba(255,255,255,0.24)",
    borderLeftWidth: 1,
    flex: 1,
    gap: 5,
    paddingLeft: 12,
  },
  entryBenefitLabel: {
    color: "#cfe7f5",
    fontSize: 10,
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
  entryBrandArc: {
    borderColor: "#ffffff",
    borderRadius: 13,
    borderTopWidth: 3,
    height: 14,
    transform: [{ rotate: "168deg" }],
    width: 23,
  },
  entryBrandMark: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 28,
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
    color: "#0b1930",
    fontSize: 22,
    fontWeight: "500",
  },
  entryButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  entryButtonText: {
    color: "#0b1930",
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.3,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  entryFootnote: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
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
  mark: {
    alignItems: "center",
    borderColor: "#2367a8",
    borderRadius: 28,
    borderWidth: 3,
    height: 56,
    justifyContent: "center",
    position: "relative",
    width: 56,
  },
  markArc: {
    borderColor: "#0b1930",
    borderRadius: 20,
    borderTopWidth: 3,
    height: 23,
    position: "absolute",
    top: 15,
    transform: [{ rotate: "180deg" }],
    width: 34,
  },
  markDot: {
    backgroundColor: "#2367a8",
    borderRadius: 3,
    bottom: 9,
    height: 6,
    position: "absolute",
    width: 6,
  },
  state: {
    alignItems: "center",
    backgroundColor: "#f8f7f3",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28,
  },
  title: {
    color: "#0b1930",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 8,
    textAlign: "center",
  },
  wordmark: {
    color: "#0b1930",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 4,
  },
});
