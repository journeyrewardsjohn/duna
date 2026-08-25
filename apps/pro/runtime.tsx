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
  ORGANIZATION_PLAN_IDS,
  ORGANIZATION_PLANS,
  type OrganizationPlanId,
} from "@duna/core";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
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
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import {
  askDunaAi,
  confirmProDunaAiAction,
  createSessionNoteRoom,
  createDunaApiClient,
  createProMessagingDeliveryEngine,
  getDunaAiSuggestions,
  uploadProductImage,
  type DunaApiClient,
  type SessionNoteRoom,
  type UploadedProductImage,
  type ProDunaAiActionOutcome,
  type ProDunaAiResponse,
} from "./mobile-api";
import type { DeliveryEngine } from "@duna/messaging-client";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
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
type OperatorMoney = Awaited<
  ReturnType<DunaApiClient["operator"]["moneyWorkspace"]["query"]>
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
  readonly money?: OperatorMoney;
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
  readonly askDunaAi?: (input: {
    readonly message: string;
    readonly pathname: string;
    readonly pageTitle?: string;
    readonly history?: readonly {
      role: "assistant" | "user";
      body: string;
    }[];
  }) => Promise<ProDunaAiResponse>;
  readonly getDunaAiSuggestions?: (input: {
    readonly pathname: string;
    readonly pageTitle?: string;
  }) => Promise<ProDunaAiResponse>;
  readonly confirmDunaAiAction?: (input: {
    readonly draftId: string;
    readonly confirmationNonce?: string;
  }) => Promise<ProDunaAiActionOutcome>;
  readonly signOut?: () => Promise<void>;
}

const RuntimeContext = createContext<ProRuntime | undefined>(undefined);
const workosClientId = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID?.trim();
const authBaseUrl = (
  process.env.EXPO_PUBLIC_DUNA_AUTH_URL?.trim() || "https://duna-web.vercel.app"
).replace(/\/+$/, "");
const previewEnabled = process.env.EXPO_PUBLIC_DUNA_PREVIEW === "true";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtimeDunaWordmark = require("./assets/duna-horizontal-blue.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const runtimeDunaMark = require("./assets/duna-mark.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const welcomePoster = require("./assets/duna-welcome-poster.jpg");

function RuntimeMark() {
  return (
    <View style={runtimeStyles.wordmarkRow}>
      <Image
        accessibilityLabel="Duna"
        resizeMode="contain"
        source={runtimeDunaWordmark}
        style={runtimeStyles.wordmarkImage}
      />
      <Text style={runtimeStyles.pro}>PRO</Text>
    </View>
  );
}

function RuntimeLoadingState() {
  return (
    <View
      accessibilityLabel="Loading Duna Pro"
      accessibilityRole="progressbar"
      style={runtimeStyles.loadingScreen}
    >
      <StatusBar style="dark" />
      <ActivityIndicator color="#1B1B19" size="small" />
    </View>
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
      <RuntimeMark />
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

function WelcomeWash() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="pro-welcome-wash" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#071625" stopOpacity="0.04" />
          <Stop offset="0.42" stopColor="#071625" stopOpacity="0.12" />
          <Stop offset="0.7" stopColor="#071625" stopOpacity="0.74" />
          <Stop offset="1" stopColor="#071625" stopOpacity="0.98" />
        </SvgLinearGradient>
      </Defs>
      <Rect fill="url(#pro-welcome-wash)" height="100%" width="100%" />
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

function WelcomeState({
  error,
  signIn,
  signUp,
}: {
  readonly error?: string;
  readonly signIn: () => Promise<void>;
  readonly signUp: () => Promise<void>;
}) {
  return (
    <ImageBackground
      resizeMode="cover"
      source={welcomePoster}
      style={runtimeStyles.entry}
    >
      <StatusBar style="light" />
      <WelcomeWash />
      <View style={runtimeStyles.entryBrand}>
        <Image
          resizeMode="contain"
          source={runtimeDunaMark}
          style={runtimeStyles.entryMark}
        />
        <Text style={runtimeStyles.entryWordmark}>PRO</Text>
      </View>
      <View style={runtimeStyles.entryContent}>
        <Text style={runtimeStyles.entryBody}>
          Welcome to Duna Pro. The one place for everything your business needs
          to win on and off the court.
        </Text>
        {error && <Text style={runtimeStyles.entryError}>{error}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={() => void signUp()}
          style={({ pressed }) => [
            runtimeStyles.entryPrimaryButton,
            pressed && runtimeStyles.buttonPressed,
          ]}
        >
          <Text style={runtimeStyles.entryPrimaryText}>
            Launch Your Volleyball Business
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signIn()}
          style={({ pressed }) => [
            runtimeStyles.entrySecondaryButton,
            pressed && runtimeStyles.buttonPressed,
          ]}
        >
          <Text style={runtimeStyles.entrySecondaryText}>
            Log in to Duna Pro
          </Text>
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
  onContinue,
  onUseDifferentAccount,
  user,
}: {
  readonly busy: boolean;
  readonly error?: string;
  readonly onContinue: () => void;
  readonly onUseDifferentAccount: () => void;
  readonly user?: WorkOSMobileUser;
}) {
  return (
    <View style={runtimeStyles.accountScreen}>
      <StatusBar style="dark" />
      <AccountContours />
      <View style={runtimeStyles.accountIdentity}>
        <Text style={runtimeStyles.accountKicker}>LOG IN AS</Text>
        {user?.profilePictureUrl ? (
          <Image
            source={{ uri: user.profilePictureUrl }}
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
          {mobileUserDisplayName(user)}
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

function OrganizationOnboarding({
  createOrganization,
  error,
  signOut,
}: {
  readonly createOrganization: ReturnType<
    typeof useWorkOSMobileAuth
  >["createOrganization"];
  readonly error?: string;
  readonly signOut: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<OrganizationPlanId>("coach");
  const [clubType, setClubType] = useState<"beach" | "indoor" | "both">(
    "beach",
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const submit = async () => {
    if (name.trim().length < 2 || !termsAccepted) {
      setLocalError("Add your club name and accept the terms to continue.");
      return;
    }
    setBusy(true);
    setLocalError(undefined);
    try {
      const created = await createOrganization({
        name: name.trim(),
        plan,
        termsAccepted,
        volleyballTypes: clubType === "both" ? ["beach", "indoor"] : [clubType],
      });
      if (created.checkoutUrl) {
        await WebBrowser.openBrowserAsync(created.checkoutUrl);
      }
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : "Duna could not create your club.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={runtimeStyles.onboarding}
      keyboardShouldPersistTaps="handled"
      style={runtimeStyles.auth}
    >
      <RuntimeMark />
      <Text style={runtimeStyles.kicker}>CREATE YOUR WORKSPACE</Text>
      <Text style={runtimeStyles.welcomeTitle}>What are you building?</Text>
      <Text style={runtimeStyles.welcomeBody}>
        Select the club you run today. You can change this in Settings later.
      </Text>
      <Text style={runtimeStyles.fieldLabel}>Club or organization name</Text>
      <TextInput
        autoCapitalize="words"
        onChangeText={setName}
        placeholder="Beach Elite Volleyball"
        placeholderTextColor="#7b8790"
        style={runtimeStyles.textInput}
        value={name}
      />
      <Text style={runtimeStyles.fieldLabel}>Volleyball program</Text>
      <View style={runtimeStyles.choiceRow}>
        {(["beach", "indoor", "both"] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setClubType(value)}
            style={[
              runtimeStyles.choice,
              clubType === value && runtimeStyles.choiceSelected,
            ]}
          >
            <Text
              style={[
                runtimeStyles.choiceText,
                clubType === value && runtimeStyles.choiceTextSelected,
              ]}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={runtimeStyles.fieldLabel}>Plan</Text>
      <View style={runtimeStyles.planList}>
        {ORGANIZATION_PLAN_IDS.map((planId) => {
          const definition = ORGANIZATION_PLANS[planId];
          return (
            <Pressable
              key={planId}
              onPress={() => setPlan(planId)}
              style={[
                runtimeStyles.nativePlan,
                plan === planId && runtimeStyles.nativePlanSelected,
              ]}
            >
              <View style={runtimeStyles.nativePlanHeading}>
                <Text style={runtimeStyles.nativePlanName}>
                  {definition.name}
                </Text>
                <Text style={runtimeStyles.nativePlanPrice}>
                  {definition.monthlyPriceMinor === 0
                    ? "$0"
                    : `$${definition.monthlyPriceMinor / 100}`}
                  /mo
                </Text>
              </View>
              <Text style={runtimeStyles.nativePlanBody}>
                {definition.defaultCommissionBps / 100}% organization fee ·{" "}
                {definition.monthlyUploadSeconds / 3_600} upload /{" "}
                {definition.monthlyLiveSeconds / 3_600} live hours
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => setTermsAccepted((value) => !value)}
        style={runtimeStyles.termsRow}
      >
        <Text style={runtimeStyles.checkbox}>{termsAccepted ? "✓" : ""}</Text>
        <Text style={runtimeStyles.termsText}>
          I agree to the Duna HQ Terms and Privacy Policy.
        </Text>
      </Pressable>
      {(localError || error) && (
        <Text style={runtimeStyles.errorText}>{localError ?? error}</Text>
      )}
      <Pressable
        disabled={busy}
        onPress={() => void submit()}
        style={runtimeStyles.primaryButton}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={runtimeStyles.primaryButtonText}>
            {plan === "coach" ? "Create My Free Club" : "Create & Continue"}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => void signOut()}
        style={runtimeStyles.secondaryButton}
      >
        <Text style={runtimeStyles.secondaryButtonText}>
          Use another account
        </Text>
      </Pressable>
    </ScrollView>
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
    createOrganization,
    selectOrganization,
    signIn,
    signUp,
    signOut,
    user,
  } = useWorkOSMobileAuth();
  const client = useMemo(() => createDunaApiClient(getToken), [getToken]);
  const messagingDelivery = useMemo(
    () => createProMessagingDeliveryEngine(getToken),
    [getToken],
  );
  const safeSignOut = useCallback(async () => {
    setContinueRequested(false);
    await unregisterMessagingNotifications(client).catch(() => undefined);
    await signOut();
  }, [client, signOut]);
  const [continueRequested, setContinueRequested] = useState(false);
  const [dashboard, setDashboard] = useState<OperatorDashboard>();
  const [workspace, setWorkspace] = useState<OperatorWorkspace>();
  const [money, setMoney] = useState<OperatorMoney>();
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
        nextMoney,
        nextMembers,
        nextEvents,
        nextMatches,
      ] = await Promise.all([
        client.operator.dashboard.query(),
        client.operator.workspace.query(),
        client.operator.moneyWorkspace.query(),
        client.operator.members.query(),
        client.operator.events.query(),
        client.operator.scorableMatches.query(),
      ]);
      setDashboard(nextDashboard);
      setWorkspace(nextWorkspace);
      setMoney(nextMoney);
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

  useEffect(() => {
    if (!isSignedIn) setContinueRequested(false);
  }, [isSignedIn]);

  const hasWorkspace = Boolean(
    dashboard && workspace && money && members && events && matches,
  );

  if (!isLoaded) {
    return <RuntimeLoadingState />;
  }
  if (!isSignedIn) {
    return <WelcomeState error={authError} signIn={signIn} signUp={signUp} />;
  }
  const preparingAccount = Boolean(organizationId && loading && !dashboard);
  if (!continueRequested || preparingAccount) {
    return (
      <ReturningAccountState
        busy={continueRequested && preparingAccount}
        error={!loading && organizationId && !hasWorkspace ? error : undefined}
        onContinue={() => {
          if (error && organizationId && !loading) void refresh();
          setContinueRequested(true);
        }}
        onUseDifferentAccount={() => void safeSignOut()}
        user={user}
      />
    );
  }
  if (!organizationId) {
    return (
      <OrganizationOnboarding
        createOrganization={createOrganization}
        error={authError}
        signOut={safeSignOut}
      />
    );
  }
  if (loading && !dashboard) {
    return <RuntimeLoadingState />;
  }
  if (
    error ||
    !dashboard ||
    !workspace ||
    !money ||
    !members ||
    !events ||
    !matches
  ) {
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
        money,
        members,
        events,
        matches,
        refresh,
        switchOrganization,
        createSessionNoteRoom: (sessionId) =>
          createSessionNoteRoom(getToken, sessionId),
        askDunaAi: (input) =>
          askDunaAi(getToken, {
            message: input.message,
            history: input.history,
            context: {
              pathname: input.pathname,
              pageTitle: input.pageTitle,
              timezone: workspace.organization.timezone,
              locale: Intl.DateTimeFormat().resolvedOptions().locale,
            },
          }),
        getDunaAiSuggestions: (input) =>
          getDunaAiSuggestions(getToken, {
            pathname: input.pathname,
            pageTitle: input.pageTitle,
            timezone: workspace.organization.timezone,
            locale: Intl.DateTimeFormat().resolvedOptions().locale,
          }),
        confirmDunaAiAction: (input) => confirmProDunaAiAction(getToken, input),
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
  buttonPressed: { opacity: 0.82 },
  checkbox: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#b4bcc2",
    borderRadius: 6,
    borderWidth: 1,
    color: "#3d6672",
    fontSize: 14,
    fontWeight: "900",
    height: 24,
    lineHeight: 22,
    textAlign: "center",
    width: 24,
  },
  choice: {
    alignItems: "center",
    borderColor: "#d9dddf",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  choiceRow: { flexDirection: "row", gap: 8 },
  choiceSelected: { backgroundColor: "#3d6672", borderColor: "#3d6672" },
  choiceText: { color: "#596873", fontSize: 13, fontWeight: "800" },
  choiceTextSelected: { color: "#ffffff" },
  errorText: {
    color: "#a54332",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  entry: {
    backgroundColor: "#071625",
    flex: 1,
    overflow: "hidden",
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
  entryError: {
    color: "#FFD9CC",
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
  featureCard: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#e1e1dc",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 13,
    width: "48.5%",
  },
  featureCheck: { color: "#3d6672", fontSize: 14, fontWeight: "900" },
  featureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  featureText: { color: "#243039", flex: 1, fontSize: 12, lineHeight: 17 },
  fieldLabel: { color: "#26343c", fontSize: 13, fontWeight: "800" },
  freePlanBody: { color: "#657083", fontSize: 12, lineHeight: 17 },
  freePlanCallout: {
    alignItems: "center",
    backgroundColor: "#edf2e2",
    borderColor: "#cbd8a7",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    padding: 16,
  },
  freePlanCopy: { flex: 1, gap: 3 },
  freePlanPrice: {
    color: "#26343c",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.5,
  },
  freePlanTitle: { color: "#26343c", fontSize: 14, fontWeight: "900" },
  kicker: {
    color: "#3d6672",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.7,
    marginTop: 14,
  },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
  },
  nativePlan: {
    backgroundColor: "#ffffff",
    borderColor: "#dedfdc",
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  nativePlanBody: { color: "#657083", fontSize: 12, lineHeight: 17 },
  nativePlanHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nativePlanName: { color: "#1d2a31", fontSize: 15, fontWeight: "900" },
  nativePlanPrice: { color: "#3d6672", fontSize: 14, fontWeight: "900" },
  nativePlanSelected: { borderColor: "#3d6672", borderWidth: 2 },
  onboarding: { gap: 14, padding: 24, paddingBottom: 48 },
  planList: { gap: 9 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#3d6672",
    borderRadius: 15,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
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
  secondaryButton: {
    alignItems: "center",
    borderColor: "#b9c2c6",
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 20,
  },
  secondaryButtonText: { color: "#3d6672", fontSize: 14, fontWeight: "800" },
  state: {
    alignItems: "center",
    backgroundColor: "#f6f5f1",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28,
  },
  termsRow: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  termsText: { color: "#657083", flex: 1, fontSize: 12, lineHeight: 18 },
  textInput: {
    backgroundColor: "#ffffff",
    borderColor: "#d4d9db",
    borderRadius: 13,
    borderWidth: 1,
    color: "#18252c",
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  title: {
    color: "#101a20",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 10,
    textAlign: "center",
  },
  welcome: { gap: 16, padding: 24, paddingBottom: 48, paddingTop: 54 },
  welcomeBody: { color: "#657083", fontSize: 15, lineHeight: 23 },
  welcomeTitle: {
    color: "#101a20",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 39,
  },
  wordmarkRow: { alignItems: "center", flexDirection: "row", gap: 9 },
  wordmarkImage: { height: 46, width: 146 },
});
