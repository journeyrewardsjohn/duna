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
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  createSessionNoteRoom,
  createDunaApiClient,
  uploadProductImage,
  type DunaApiClient,
  type SessionNoteRoom,
  type UploadedProductImage,
} from "./mobile-api";
import { FellixText as Text } from "./fellix-text";

type OperatorDashboard = Awaited<
  ReturnType<DunaApiClient["operator"]["dashboard"]["query"]>
>;
type OperatorWorkspace = Awaited<
  ReturnType<DunaApiClient["operator"]["workspace"]["query"]>
>;
type OperatorMembers = Awaited<
  ReturnType<DunaApiClient["operator"]["members"]["query"]>
>;
type OperatorEvents = Awaited<
  ReturnType<DunaApiClient["operator"]["events"]["query"]>
>;
export type OperatorMatches = Awaited<
  ReturnType<DunaApiClient["operator"]["scorableMatches"]["query"]>
>;
export type OperatorMatchScoringState = Awaited<
  ReturnType<DunaApiClient["operator"]["matchScoringState"]["query"]>
>;

export interface ProRuntime {
  readonly mode: "preview" | "live";
  readonly client?: DunaApiClient;
  readonly dashboard?: OperatorDashboard;
  readonly workspace?: OperatorWorkspace;
  readonly members?: OperatorMembers;
  readonly events?: OperatorEvents;
  readonly matches?: OperatorMatches;
  readonly refresh: () => Promise<void>;
  readonly uploadProductImage?: (input: {
    readonly uri: string;
    readonly name?: string;
    readonly type?: string;
  }) => Promise<UploadedProductImage>;
  readonly createSessionNoteRoom?: (
    sessionId: string,
  ) => Promise<SessionNoteRoom>;
  readonly signOut?: () => Promise<void>;
}

const RuntimeContext = createContext<ProRuntime | undefined>(undefined);
const workosClientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID?.trim();
const authBaseUrl = (
  process.env.EXPO_PUBLIC_DUNA_AUTH_URL?.trim() || "https://duna-web.vercel.app"
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
      <View style={runtimeStyles.wordmarkRow}>
        <View style={runtimeStyles.mark}>
          <View style={runtimeStyles.markArc} />
          <View style={runtimeStyles.markDot} />
        </View>
        <Text style={runtimeStyles.wordmark}>DUNA</Text>
        <Text style={runtimeStyles.pro}>PRO</Text>
      </View>
      <Text style={runtimeStyles.title}>{title}</Text>
      <Text style={runtimeStyles.body}>{body}</Text>
      {busy && <ActivityIndicator color="#f7c86b" size="small" />}
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
    organizationId,
    signIn,
    signOut,
  } = useWorkOSMobileAuth();
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const [dashboard, setDashboard] = useState<OperatorDashboard>();
  const [workspace, setWorkspace] = useState<OperatorWorkspace>();
  const [members, setMembers] = useState<OperatorMembers>();
  const [events, setEvents] = useState<OperatorEvents>();
  const [matches, setMatches] = useState<OperatorMatches>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(undefined);
    try {
      const [
        nextDashboard,
        nextWorkspace,
        nextMembers,
        nextEvents,
        nextMatches,
      ] = await Promise.all([
        client.operator.dashboard.query(),
        client.operator.workspace.query(),
        client.operator.members.query(),
        client.operator.events.query(),
        client.operator.scorableMatches.query(),
      ]);
      setDashboard(nextDashboard);
      setWorkspace(nextWorkspace);
      setMembers(nextMembers);
      setEvents(nextEvents);
      setMatches(nextMatches);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna Pro could not load this organization.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, organizationId]);

  useEffect(() => {
    if (isLoaded && isSignedIn && organizationId) void refresh();
  }, [isLoaded, isSignedIn, organizationId, refresh]);

  if (!isLoaded) {
    return (
      <CenteredState
        body="Restoring your encrypted operator session."
        busy
        title="Opening Duna Pro"
      />
    );
  }
  if (!isSignedIn) {
    return (
      <CenteredState
        action="Sign in"
        body={
          authError ??
          "Use your secure Duna identity to open the organization workspace."
        }
        onAction={() => void signIn()}
        title="Run your day from anywhere"
      />
    );
  }
  if (!organizationId) {
    return (
      <CenteredState
        action="Sign out"
        body="Your Duna identity is valid, but it has not been invited to a club or coaching organization."
        onAction={() => void signOut()}
        title="Club access required"
      />
    );
  }
  if (loading && !dashboard) {
    return (
      <CenteredState
        body="Selecting your club and syncing today’s operation."
        busy
        title="Loading your workspace"
      />
    );
  }
  if (error || !dashboard || !workspace || !members || !events || !matches) {
    return (
      <CenteredState
        action="Try again"
        body={error ?? "This organization is not available yet."}
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
        workspace,
        members,
        events,
        matches,
        refresh,
        createSessionNoteRoom: (sessionId) =>
          createSessionNoteRoom(getToken, sessionId),
        uploadProductImage: (input) => uploadProductImage(getToken, input),
        signOut,
      }}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

function PreviewRuntime({ children }: { readonly children: ReactNode }) {
  const value = useMemo<ProRuntime>(
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

export function ProRuntimeProvider({
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
      requireOrganization
      scheme="duna-pro"
    >
      <ConnectedRuntime>{children}</ConnectedRuntime>
    </WorkOSMobileAuthProvider>
  );
}

export function useProRuntime(): ProRuntime {
  const value = useContext(RuntimeContext);
  if (!value) {
    throw new Error("useProRuntime must be used inside ProRuntimeProvider");
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
    borderRadius: 22,
    borderWidth: 3,
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  markArc: {
    borderColor: "#0b1930",
    borderRadius: 16,
    borderTopWidth: 3,
    height: 18,
    position: "absolute",
    top: 12,
    transform: [{ rotate: "180deg" }],
    width: 27,
  },
  markDot: {
    backgroundColor: "#2367a8",
    borderRadius: 3,
    bottom: 7,
    height: 5,
    position: "absolute",
    width: 5,
  },
  pro: {
    backgroundColor: "rgba(247,200,107,.12)",
    borderRadius: 6,
    color: "#2367a8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
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
    marginTop: 10,
    textAlign: "center",
  },
  wordmark: {
    color: "#0b1930",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 4,
  },
  wordmarkRow: { alignItems: "center", flexDirection: "row", gap: 9 },
});
