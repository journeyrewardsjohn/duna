import { ClerkProvider, useAuth } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native";
import { tokenCache } from "@clerk/expo/token-cache";
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
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
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
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();
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
      <View style={runtimeStyles.auth}>
        <AuthView isDismissible={false} mode="signInOrUp" />
      </View>
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
  if (!publishableKey) {
    if (previewEnabled) return <PreviewRuntime>{children}</PreviewRuntime>;
    return (
      <CenteredState
        body="This production build is intentionally locked until a Clerk publishable key is added to the Duna mobile environment."
        title="Identity setup required"
      />
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ConnectedRuntime>{children}</ConnectedRuntime>
    </ClerkProvider>
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
  auth: { backgroundColor: "#070b0d", flex: 1 },
  body: {
    color: "#aaa79e",
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 340,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#63e3db",
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: { color: "#070b0d", fontSize: 14, fontWeight: "800" },
  mark: {
    alignItems: "center",
    borderColor: "#63e3db",
    borderRadius: 28,
    borderWidth: 3,
    height: 56,
    justifyContent: "center",
    position: "relative",
    width: 56,
  },
  markArc: {
    borderColor: "#f3efe5",
    borderRadius: 20,
    borderTopWidth: 3,
    height: 23,
    position: "absolute",
    top: 15,
    transform: [{ rotate: "180deg" }],
    width: 34,
  },
  markDot: {
    backgroundColor: "#63e3db",
    borderRadius: 3,
    bottom: 9,
    height: 6,
    position: "absolute",
    width: 6,
  },
  state: {
    alignItems: "center",
    backgroundColor: "#070b0d",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28,
  },
  title: {
    color: "#f3efe5",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 8,
    textAlign: "center",
  },
  wordmark: {
    color: "#f3efe5",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 4,
  },
});
