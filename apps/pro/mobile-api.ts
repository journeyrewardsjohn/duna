import type {
  AppRouter,
  DunaAiActionOutcome,
  DunaAiClientContext,
  DunaAiResponse,
} from "@duna/api";
import {
  createCursorSyncEngine,
  type DeliveryEngine,
} from "@duna/messaging-client";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";

const defaultApiUrl = "https://duna-web.vercel.app/api/trpc";
const defaultWebUrl = "https://hq.duna.coach";

function normalizeApiUrl(value: string | undefined): string {
  const candidate = value?.trim() || defaultApiUrl;
  const withoutSlash = candidate.replace(/\/+$/, "");
  return withoutSlash.endsWith("/api/trpc")
    ? withoutSlash
    : `${withoutSlash}/api/trpc`;
}

export const dunaApiUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_DUNA_API_URL);
export const dunaApiBaseUrl = dunaApiUrl.replace(/\/api\/trpc$/, "");
export const dunaHqUrl = (
  process.env.EXPO_PUBLIC_DUNA_HQ_URL?.trim() || defaultWebUrl
).replace(/\/+$/, "");

export type DunaApiClient = TRPCClient<AppRouter>;
export type TokenGetter = () => Promise<string | null>;

export type ProDunaAiResponse = DunaAiResponse;
export type ProDunaAiActionOutcome = DunaAiActionOutcome;

async function postDunaAi<T>(
  getToken: TokenGetter,
  body: Readonly<Record<string, unknown>>,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before using Duna AI.");
  const response = await fetch(`${dunaApiBaseUrl}/api/duna-ai`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T | { readonly error?: string };
  const errorMessage =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
      ? payload.error
      : undefined;
  if (!response.ok || errorMessage) {
    throw new Error(errorMessage ?? "Duna AI could not complete that request.");
  }
  return payload as T;
}

export function askDunaAi(
  getToken: TokenGetter,
  input: {
    readonly message: string;
    readonly context: DunaAiClientContext;
    readonly history?: readonly { role: "assistant" | "user"; body: string }[];
  },
): Promise<ProDunaAiResponse> {
  return postDunaAi(getToken, {
    mode: "ask",
    surface: "pro",
    page: input.context.pathname,
    context: input.context,
    message: input.message,
    history: input.history,
    researchMode: "off",
  });
}

export function getDunaAiSuggestions(
  getToken: TokenGetter,
  context: DunaAiClientContext,
): Promise<ProDunaAiResponse> {
  return postDunaAi(getToken, {
    mode: "suggestions",
    surface: "pro",
    page: context.pathname,
    context,
  });
}

export async function confirmProDunaAiAction(
  getToken: TokenGetter,
  input: { readonly draftId: string; readonly confirmationNonce?: string },
): Promise<ProDunaAiActionOutcome> {
  const payload = await postDunaAi<{ result: ProDunaAiActionOutcome }>(
    getToken,
    {
      mode: "confirm",
      draftId: input.draftId,
      confirmationNonce: input.confirmationNonce,
    },
  );
  return payload.result;
}

export function createDunaApiClient(getToken: TokenGetter): DunaApiClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: dunaApiUrl,
        headers: async () => {
          const token = await getToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export function createProMessagingDeliveryEngine(
  getToken: TokenGetter,
): DeliveryEngine {
  return createCursorSyncEngine({
    asPrincipal: "organization",
    baseUrl: `${dunaApiBaseUrl}/api/messaging`,
    fetchClient: async (input, init) => {
      const headers = new Headers(init?.headers);
      const token = await getToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    pollIntervalMs: 15_000,
  });
}

export interface UploadedProductImage {
  readonly url: string;
  readonly kind: "image";
  readonly contentType: string;
  readonly size: number;
}

export interface SessionNoteRoom {
  readonly participantToken: string;
  readonly serverUrl: string;
  readonly roomName: string;
}

export async function createSessionNoteRoom(
  getToken: TokenGetter,
  sessionId: string,
): Promise<SessionNoteRoom> {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before recording a voice note.");
  const response = await fetch(
    `${dunaApiBaseUrl}/api/operator/session-notes/token`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    },
  );
  const payload = (await response.json()) as
    SessionNoteRoom | { readonly error?: string };
  if (!response.ok || !("participantToken" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "The LiveKit voice room could not be started.",
    );
  }
  return payload;
}

export async function uploadProductImage(
  getToken: TokenGetter,
  input: {
    readonly uri: string;
    readonly name?: string;
    readonly type?: string;
  },
): Promise<UploadedProductImage> {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before uploading this image.");
  const form = new FormData();
  form.append("file", {
    uri: input.uri,
    name: input.name ?? `duna-product-${Date.now()}.jpg`,
    type: input.type ?? "image/jpeg",
  } as unknown as Blob);
  const response = await fetch(`${dunaApiBaseUrl}/api/operator/product-media`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = (await response.json()) as
    UploadedProductImage | { readonly error?: string };
  if (!response.ok || !("url" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "The product image could not be uploaded.",
    );
  }
  return payload;
}
