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
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import {
  createSessionNoteRoom,
  createDunaApiClient,
  createProMessagingDeliveryEngine,
  uploadProductImage,
  type DunaApiClient,
  type SessionNoteRoom,
  type UploadedProductImage,
} from "./mobile-api";
import type { DeliveryEngine } from "@duna/messaging-client";
import { SatoshiText as Text } from "./satoshi-text";
import {
  registerMessagingNotifications,
  unregisterMessagingNotifications,
} from "./messaging-notifications";

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
  readonly messagingDelivery?: DeliveryEngine;
  readonly dashboard?: OperatorDashboard;
  readonly workspace?: OperatorWorkspace;
  readonly members?: OperatorMembers;
  readonly events?: OperatorEvents;
  readonly matches?: OperatorMatches;
  readonly authOrganizations?: readonly WorkOSMobileOrganization[];
  readonly activeAuthOrganizationId?: string;
  readonly refresh: () => Promise<void>;
  readonly switchOrganization?: (organizationId: string) => Promise<void>;
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

function RuntimeMark() {
  return (
    <Svg height="33" viewBox="0 0 64 48" width="44">
      <Line
        opacity={0.38}
        stroke="#d4b77c"
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
        stroke="#d4b77c"
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
      <View style={runtimeStyles.wordmarkRow}>
        <RuntimeMark />
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
    organizations,
    selectOrganization,
    signIn,
    signOut,
  } = useWorkOSMobileAuth();
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const messagingDelivery = useMemo(
    () => createProMessagingDeliveryEngine(getToken),
    [getToken],
  );
  const safeSignOut = useCallback(async () => {
    await unregisterMessagingNotifications(client).catch(() => undefined);
    await signOut();
  }, [client, signOut]);
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
  const switchOrganization = useCallback(
    async (nextOrganizationId: string) => {
      await selectOrganization(nextOrganizationId);
    },
    [selectOrganization],
  );

  useEffect(() => {
    if (isLoaded && isSignedIn && organizationId) void refresh();
  }, [isLoaded, isSignedIn, organizationId, refresh]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void registerMessagingNotifications(client, false).catch(() => undefined);
  }, [client, isLoaded, isSignedIn]);

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
        onAction={() => void safeSignOut()}
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
        activeAuthOrganizationId: organizationId,
        authOrganizations: organizations,
        mode: "live",
        client,
        messagingDelivery,
        dashboard,
        workspace,
        members,
        events,
        matches,
        refresh,
        switchOrganization,
        createSessionNoteRoom: (sessionId) =>
          createSessionNoteRoom(getToken, sessionId),
        uploadProductImage: (input) => uploadProductImage(getToken, input),
        signOut: safeSignOut,
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
  pro: {
    backgroundColor: "rgba(247,200,107,.12)",
    borderRadius: 6,
    color: "#3d6672",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
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
    marginTop: 10,
    textAlign: "center",
  },
  wordmark: {
    color: "#101a20",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 4,
  },
  wordmarkRow: { alignItems: "center", flexDirection: "row", gap: 9 },
});
