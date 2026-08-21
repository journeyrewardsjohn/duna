import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

WebBrowser.maybeCompleteAuthSession();

const ACCESS_TOKEN_KEY = "duna.workos.access-token";
const EXPIRES_AT_KEY = "duna.workos.expires-at";
const REFRESH_TOKEN_KEY = "duna.workos.refresh-token";
const ORGANIZATION_KEY = "duna.workos.organization-id";
const MOBILE_AUTH_REQUEST_TIMEOUT_MS = 12_000;
const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: "https://api.workos.com/user_management/authorize",
};

interface MobileSession {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly refreshToken: string;
  readonly organizationId?: string;
}

export interface WorkOSMobileOrganization {
  readonly id: string;
  readonly name: string;
  readonly role?: string;
}

export interface CreateWorkOSMobileOrganizationInput {
  readonly name: string;
  readonly plan: "coach" | "small-club" | "club";
  readonly volleyballTypes: readonly ("beach" | "indoor")[];
  readonly termsAccepted: boolean;
}

export interface CreateWorkOSMobileOrganizationResult {
  readonly id: string;
  readonly checkoutUrl?: string;
}

interface WorkOSMobileAuth {
  readonly createOrganization: (
    input: CreateWorkOSMobileOrganizationInput,
  ) => Promise<CreateWorkOSMobileOrganizationResult>;
  readonly error?: string;
  readonly getToken: () => Promise<string | null>;
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly isSwitchingOrganization: boolean;
  readonly organizationId?: string;
  readonly organizations: readonly WorkOSMobileOrganization[];
  readonly selectOrganization: (organizationId: string) => Promise<void>;
  readonly signIn: () => Promise<void>;
  readonly signUp: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

class MobileAuthResponseError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "MobileAuthResponseError";
    this.code = code;
    this.status = status;
  }
}

const WorkOSMobileAuthContext = createContext<WorkOSMobileAuth | undefined>(
  undefined,
);

async function storeSession(session: MobileSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
    SecureStore.setItemAsync(EXPIRES_AT_KEY, String(session.expiresAt)),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
    session.organizationId
      ? SecureStore.setItemAsync(ORGANIZATION_KEY, session.organizationId)
      : SecureStore.deleteItemAsync(ORGANIZATION_KEY),
  ]);
}

async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(EXPIRES_AT_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(ORGANIZATION_KEY),
  ]);
}

let backgroundRefresh: Promise<string | null> | undefined;

/**
 * Restores or refreshes the same encrypted mobile session for a short-lived
 * background task. This never copies the token into app preferences or task
 * payloads; it remains in SecureStore.
 */
export async function getStoredWorkOSMobileToken(
  authBaseUrl: string,
): Promise<string | null> {
  const [accessToken, expiresAt, refreshToken, organizationId] =
    await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(EXPIRES_AT_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(ORGANIZATION_KEY),
    ]);
  if (accessToken && Number(expiresAt) > Date.now() + 60_000) {
    return accessToken;
  }
  if (!refreshToken) return null;
  backgroundRefresh ??= mobileAuthFetch(
    `${cleanBaseUrl(authBaseUrl)}/api/auth/mobile/refresh`,
    {
      body: JSON.stringify({
        organizationId: organizationId ?? undefined,
        refreshToken,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  )
    .then((response) => responseJson<MobileSession>(response))
    .then(async (session) => {
      await storeSession(session);
      return session.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      backgroundRefresh = undefined;
    });
  return backgroundRefresh;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function mobileAuthFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MOBILE_AUTH_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") {
      throw new Error(
        "Duna could not reach secure sign-in in time. Please try again.",
        { cause: reason },
      );
    }
    throw reason;
  } finally {
    clearTimeout(timeout);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & {
    code?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new MobileAuthResponseError(
      body.error || "Duna could not complete sign-in.",
      response.status,
      body.code,
    );
  }
  return body;
}

function isTerminalSessionError(reason: unknown): boolean {
  if (!(reason instanceof MobileAuthResponseError)) return false;
  return (
    reason.code === "invalid_grant" ||
    reason.code === "session_revoked" ||
    reason.status === 401 ||
    (reason.status === 400 && reason.message === "Invalid refresh request.")
  );
}

export function WorkOSMobileAuthProvider({
  authBaseUrl,
  children,
  clientId,
  requireOrganization = false,
  scheme,
}: {
  readonly authBaseUrl: string;
  readonly children: ReactNode;
  readonly clientId: string;
  readonly requireOrganization?: boolean;
  readonly scheme: string;
}) {
  // This package is used by Duna's native apps, whose callback scheme is an
  // explicit required input. Building the URI directly also keeps clean native
  // builds independent of Expo's optional embedded manifest resource.
  const redirectUri = `${scheme}://auth/callback`;
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || "unconfigured",
      extraParams: { provider: "authkit" },
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ["openid", "profile", "email"],
      usePKCE: true,
    },
    discovery,
  );
  const baseUrl = cleanBaseUrl(authBaseUrl);
  const sessionRef = useRef<MobileSession | undefined>(undefined);
  const refreshRef = useRef<Promise<MobileSession> | undefined>(undefined);
  const [session, setSession] = useState<MobileSession | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSwitchingOrganization, setIsSwitchingOrganization] = useState(false);
  const [organizations, setOrganizations] = useState<
    readonly WorkOSMobileOrganization[]
  >([]);
  const [error, setError] = useState<string>();

  const commitSession = useCallback(async (next: MobileSession) => {
    await storeSession(next);
    sessionRef.current = next;
    setSession(next);
  }, []);

  const loadOrganizations = useCallback(
    async (accessToken: string) => {
      const organizationResponse = await mobileAuthFetch(
        `${baseUrl}/api/auth/mobile/organizations`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      const organizationBody = await responseJson<{
        readonly organizations: readonly WorkOSMobileOrganization[];
      }>(organizationResponse);
      setOrganizations(organizationBody.organizations);
      return organizationBody.organizations;
    },
    [baseUrl],
  );

  const addDefaultOrganization = useCallback(
    async (next: MobileSession): Promise<MobileSession> => {
      if (!requireOrganization || next.organizationId) return next;
      const firstOrganization = (await loadOrganizations(next.accessToken))[0];
      if (!firstOrganization) return next;
      const refreshResponse = await mobileAuthFetch(
        `${baseUrl}/api/auth/mobile/refresh`,
        {
          body: JSON.stringify({
            organizationId: firstOrganization.id,
            refreshToken: next.refreshToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      return responseJson<MobileSession>(refreshResponse);
    },
    [baseUrl, loadOrganizations, requireOrganization],
  );

  const refreshSession = useCallback(
    async (current: MobileSession): Promise<MobileSession> => {
      refreshRef.current ??= mobileAuthFetch(
        `${baseUrl}/api/auth/mobile/refresh`,
        {
          body: JSON.stringify({
            organizationId: current.organizationId,
            refreshToken: current.refreshToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      )
        .then((refreshResponse) => responseJson<MobileSession>(refreshResponse))
        .then(commitSession)
        .then(() => sessionRef.current!)
        .finally(() => {
          refreshRef.current = undefined;
        });
      return refreshRef.current;
    },
    [baseUrl, commitSession],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(EXPIRES_AT_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(ORGANIZATION_KEY),
    ]).then(async ([accessToken, expiresAt, refreshToken, organizationId]) => {
      if (!active) return;
      if (accessToken && refreshToken) {
        const cached: MobileSession = {
          accessToken,
          expiresAt: Number(expiresAt) || 0,
          refreshToken,
          organizationId: organizationId ?? undefined,
        };
        try {
          const fresh =
            cached.expiresAt <= Date.now() + 60_000
              ? await refreshSession(cached)
              : cached;
          const restored = await addDefaultOrganization(fresh);
          if (active) await commitSession(restored);
        } catch (reason) {
          if (isTerminalSessionError(reason)) {
            await clearSession();
          } else if (active) {
            sessionRef.current = cached;
            setSession(cached);
            setError(
              "Duna could not refresh your secure session. Check your connection and try again.",
            );
          }
        }
      }
      if (active) setIsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [addDefaultOrganization, commitSession, refreshSession]);

  useEffect(() => {
    if (!session) {
      setOrganizations([]);
      return;
    }
    let active = true;
    void loadOrganizations(session.accessToken)
      .then((nextOrganizations) => {
        if (active) setOrganizations(nextOrganizations);
      })
      .catch(() => {
        if (active) setOrganizations([]);
      });
    return () => {
      active = false;
    };
  }, [loadOrganizations, session]);

  useEffect(() => {
    if (response?.type !== "success") {
      if (response?.type === "error") {
        setError("WorkOS could not complete this sign-in.");
      }
      return;
    }
    const code = response.params.code;
    const codeVerifier = request?.codeVerifier;
    if (!code || !codeVerifier) {
      setError("The secure sign-in verifier is missing. Please try again.");
      return;
    }
    setError(undefined);
    void mobileAuthFetch(`${baseUrl}/api/auth/mobile/exchange`, {
      body: JSON.stringify({ code, codeVerifier }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
      .then((exchangeResponse) => responseJson<MobileSession>(exchangeResponse))
      .then(addDefaultOrganization)
      .then(commitSession)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Duna could not complete sign-in.",
        );
      });
  }, [
    addDefaultOrganization,
    baseUrl,
    commitSession,
    request?.codeVerifier,
    response,
  ]);

  const getToken = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (current.expiresAt > Date.now() + 60_000) return current.accessToken;
    try {
      return (await refreshSession(current)).accessToken;
    } catch (reason) {
      if (isTerminalSessionError(reason)) {
        await clearSession();
        sessionRef.current = undefined;
        setSession(undefined);
        return null;
      }
      setError(
        "Duna could not refresh your secure session. Check your connection and try again.",
      );
      throw reason;
    }
  }, [refreshSession]);
  const signIn = useCallback(async () => {
    setError(undefined);
    if (!clientId || !request?.url) {
      setError("WorkOS is not configured for this build.");
      return;
    }
    await promptAsync();
  }, [clientId, promptAsync, request]);
  const signUp = useCallback(async () => {
    setError(undefined);
    if (!clientId || !request?.url) {
      setError("WorkOS is not configured for this build.");
      return;
    }
    const url = new URL(request.url);
    url.searchParams.set("screen_hint", "sign-up");
    await promptAsync({ url: url.toString() });
  }, [clientId, promptAsync, request]);
  const createOrganization = useCallback(
    async (
      input: CreateWorkOSMobileOrganizationInput,
    ): Promise<CreateWorkOSMobileOrganizationResult> => {
      const current = sessionRef.current;
      if (!current) throw new Error("Create your account before your club.");
      setError(undefined);
      const organizationResponse = await mobileAuthFetch(
        `${baseUrl}/api/auth/mobile/organizations`,
        {
          body: JSON.stringify(input),
          headers: {
            authorization: `Bearer ${current.accessToken}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const created =
        await responseJson<CreateWorkOSMobileOrganizationResult>(
          organizationResponse,
        );
      const refreshResponse = await mobileAuthFetch(
        `${baseUrl}/api/auth/mobile/refresh`,
        {
          body: JSON.stringify({
            organizationId: created.id,
            refreshToken: current.refreshToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      await commitSession(await responseJson<MobileSession>(refreshResponse));
      await loadOrganizations(current.accessToken).catch(() => undefined);
      return created;
    },
    [baseUrl, commitSession, loadOrganizations],
  );
  const selectOrganization = useCallback(
    async (organizationId: string) => {
      const current = sessionRef.current;
      if (!current) throw new Error("Sign in before choosing an organization.");
      if (current.organizationId === organizationId) return;
      if (
        !organizations.some(
          (organization) => organization.id === organizationId,
        )
      ) {
        throw new Error("You no longer have access to this organization.");
      }
      setError(undefined);
      setIsSwitchingOrganization(true);
      try {
        const refreshResponse = await mobileAuthFetch(
          `${baseUrl}/api/auth/mobile/refresh`,
          {
            body: JSON.stringify({
              organizationId,
              refreshToken: current.refreshToken,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        );
        await commitSession(await responseJson<MobileSession>(refreshResponse));
      } catch (reason) {
        const message =
          reason instanceof Error
            ? reason.message
            : "Duna could not switch organizations.";
        setError(message);
        throw new Error(message, { cause: reason });
      } finally {
        setIsSwitchingOrganization(false);
      }
    },
    [baseUrl, commitSession, organizations],
  );
  const signOut = useCallback(async () => {
    await clearSession();
    sessionRef.current = undefined;
    setSession(undefined);
  }, []);

  const value = useMemo<WorkOSMobileAuth>(
    () => ({
      createOrganization,
      error,
      getToken,
      isLoaded,
      isSignedIn: Boolean(session),
      isSwitchingOrganization,
      organizationId: session?.organizationId,
      organizations,
      selectOrganization,
      signIn,
      signUp,
      signOut,
    }),
    [
      error,
      createOrganization,
      getToken,
      isLoaded,
      isSwitchingOrganization,
      organizations,
      selectOrganization,
      session,
      signIn,
      signUp,
      signOut,
    ],
  );

  return (
    <WorkOSMobileAuthContext.Provider value={value}>
      {children}
    </WorkOSMobileAuthContext.Provider>
  );
}

export function useWorkOSMobileAuth(): WorkOSMobileAuth {
  const value = useContext(WorkOSMobileAuthContext);
  if (!value) {
    throw new Error(
      "useWorkOSMobileAuth must be used inside WorkOSMobileAuthProvider",
    );
  }
  return value;
}
