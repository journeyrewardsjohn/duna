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
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createDunaApiClient, type DunaApiClient } from "./mobile-api";

type PlayerDashboard = Awaited<
  ReturnType<DunaApiClient["player"]["dashboard"]["query"]>
>;
type PlayerWallet = Awaited<
  ReturnType<DunaApiClient["player"]["wallet"]["query"]>
>;
type PlayerSettings = Awaited<
  ReturnType<DunaApiClient["player"]["settings"]["query"]>
>;
type PublicPeople = Awaited<
  ReturnType<DunaApiClient["public"]["players"]["query"]>
>;
type PublicVenues = Awaited<
  ReturnType<DunaApiClient["public"]["venues"]["query"]>
>;

export interface PlayerRuntime {
  readonly mode: "preview" | "live";
  readonly client?: DunaApiClient;
  readonly dashboard?: PlayerDashboard;
  readonly wallet?: PlayerWallet;
  readonly settings?: PlayerSettings;
  readonly people?: PublicPeople;
  readonly venues?: PublicVenues;
  readonly refresh: () => Promise<void>;
  readonly signOut?: () => Promise<void>;
}

const RuntimeContext = createContext<PlayerRuntime | undefined>(undefined);
const workosClientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID?.trim();
const authBaseUrl = (
  process.env.EXPO_PUBLIC_DUNA_WEB_URL?.trim() || "https://duna-web.vercel.app"
).replace(/\/+$/, "");
const previewEnabled = process.env.EXPO_PUBLIC_DUNA_PREVIEW === "true";

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
  const [people, setPeople] = useState<PublicPeople>();
  const [venues, setVenues] = useState<PublicVenues>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextDashboard, nextWallet, nextSettings, nextPeople, nextVenues] =
        await Promise.all([
          client.player.dashboard.query(),
          client.player.wallet.query(),
          client.player.settings.query(),
          client.public.players.query({ limit: 12 }),
          client.public.venues.query(),
        ]);
      setDashboard(nextDashboard);
      setWallet(nextWallet);
      setSettings(nextSettings);
      setPeople(nextPeople);
      setVenues(nextVenues);
    } catch (reason) {
      setError(
        reason instanceof Error
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
    return (
      <CenteredState
        action="Sign in or create account"
        body={
          authError ??
          "Use one secure Duna identity for play, ratings, bookings, and events."
        }
        onAction={() => void signIn()}
        title="Your game, connected"
      />
    );
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
  if (error || !dashboard || !wallet || !settings || !people || !venues) {
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
        dashboard,
        wallet,
        settings,
        people,
        venues,
        refresh,
        signOut,
      }}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

function PreviewRuntime({ children }: { readonly children: ReactNode }) {
  const value = useMemo<PlayerRuntime>(
    () => ({
      mode: "preview",
      refresh: async () => undefined,
    }),
    [],
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
