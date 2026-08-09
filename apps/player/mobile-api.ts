import type { AppRouter } from "@duna/api";
import { createTRPCClient, httpBatchLink, type TRPCClient } from "@trpc/client";

const defaultApiUrl = "https://duna.coach/api/trpc";
const defaultWebUrl = "https://duna.coach";
const MOBILE_API_TIMEOUT_MS = 20_000;

function normalizeApiUrl(value: string | undefined): string {
  const candidate = value?.trim() || defaultApiUrl;
  const withoutSlash = candidate.replace(/\/+$/, "");
  return withoutSlash.endsWith("/api/trpc")
    ? withoutSlash
    : `${withoutSlash}/api/trpc`;
}

export const dunaApiUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_DUNA_API_URL);
export const dunaApiBaseUrl = dunaApiUrl.replace(/\/api\/trpc$/, "");
export const dunaWebUrl = (
  process.env.EXPO_PUBLIC_DUNA_WEB_URL?.trim() || defaultWebUrl
).replace(/\/+$/, "");

export type DunaApiClient = TRPCClient<AppRouter>;
export type TokenGetter = () => Promise<string | null>;

export interface UploadedPlayerMedia {
  readonly url: string;
  readonly kind: "action";
  readonly contentType: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MOBILE_API_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (init?.signal?.aborted) abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abort);
  }
}

export function createDunaApiClient(getToken: TokenGetter): DunaApiClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: dunaApiUrl,
        fetch: fetchWithTimeout,
        headers: async () => {
          const token = await getToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export async function uploadPlayerMedia(
  getToken: TokenGetter,
  input: {
    readonly uri: string;
    readonly name?: string;
    readonly type?: string;
    readonly width: number;
    readonly height: number;
  },
): Promise<UploadedPlayerMedia> {
  const token = await getToken();
  if (!token) throw new Error("Sign in again before uploading your photo.");
  const form = new FormData();
  form.append("file", {
    uri: input.uri,
    name: input.name ?? `duna-player-${Date.now()}.jpg`,
    type: input.type ?? "image/jpeg",
  } as unknown as Blob);
  form.append("width", String(input.width));
  form.append("height", String(input.height));
  const response = await fetch(
    `${dunaApiBaseUrl}/api/player-media/native-upload`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    },
  );
  const payload = (await response.json()) as
    UploadedPlayerMedia | { readonly error?: string };
  if (!response.ok || !("url" in payload)) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "The action photo could not be uploaded.",
    );
  }
  return payload;
}
