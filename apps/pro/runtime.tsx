import { ClerkProvider, useAuth, useOrganizationList } from "@clerk/expo";
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
  readonly signOut?: () => Promise<void>;
}

const RuntimeContext = createContext<ProRuntime | undefined>(undefined);
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
  const { getToken, isLoaded, isSignedIn, orgId, signOut } = useAuth();
  const {
    isLoaded: organizationsLoaded,
    setActive,
    userMemberships,
  } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const [dashboard, setDashboard] = useState<OperatorDashboard>();
  const [workspace, setWorkspace] = useState<OperatorWorkspace>();
  const [members, setMembers] = useState<OperatorMembers>();
  const [events, setEvents] = useState<OperatorEvents>();
  const [matches, setMatches] = useState<OperatorMatches>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const memberships = userMemberships.data ?? [];

  useEffect(() => {
    if (
      isLoaded &&
      isSignedIn &&
      organizationsLoaded &&
      !orgId &&
      memberships[0]
    ) {
      void setActive({ organization: memberships[0].organization.id });
    }
  }, [
    isLoaded,
    isSignedIn,
    memberships,
    orgId,
    organizationsLoaded,
    setActive,
  ]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
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
  }, [client, orgId]);

  useEffect(() => {
    if (isLoaded && isSignedIn && orgId) void refresh();
  }, [isLoaded, isSignedIn, orgId, refresh]);

  if (!isLoaded || !organizationsLoaded) {
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
      <View style={runtimeStyles.auth}>
        <AuthView isDismissible={false} mode="signIn" />
      </View>
    );
  }
  if (!orgId && memberships.length === 0) {
    return (
      <CenteredState
        action="Sign out"
        body="Your Duna identity is valid, but it has not been invited to a club or coaching organization."
        onAction={() => void signOut()}
        title="Club access required"
      />
    );
  }
  if (!orgId || (loading && !dashboard)) {
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
  if (!publishableKey) {
    if (previewEnabled) return <PreviewRuntime>{children}</PreviewRuntime>;
    return (
      <CenteredState
        body="This production build is intentionally locked until a Clerk publishable key is added to the Duna Pro environment."
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

export function useProRuntime(): ProRuntime {
  const value = useContext(RuntimeContext);
  if (!value) {
    throw new Error("useProRuntime must be used inside ProRuntimeProvider");
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
    backgroundColor: "#f7c86b",
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  buttonText: { color: "#070b0d", fontSize: 14, fontWeight: "800" },
  mark: {
    alignItems: "center",
    borderColor: "#f7c86b",
    borderRadius: 22,
    borderWidth: 3,
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  markArc: {
    borderColor: "#f3efe5",
    borderRadius: 16,
    borderTopWidth: 3,
    height: 18,
    position: "absolute",
    top: 12,
    transform: [{ rotate: "180deg" }],
    width: 27,
  },
  markDot: {
    backgroundColor: "#63e3db",
    borderRadius: 3,
    bottom: 7,
    height: 5,
    position: "absolute",
    width: 5,
  },
  pro: {
    backgroundColor: "rgba(247,200,107,.12)",
    borderRadius: 6,
    color: "#f7c86b",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
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
    marginTop: 10,
    textAlign: "center",
  },
  wordmark: {
    color: "#f3efe5",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 4,
  },
  wordmarkRow: { alignItems: "center", flexDirection: "row", gap: 9 },
});
