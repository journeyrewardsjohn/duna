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
export const dunaWebUrl = (
  process.env.EXPO_PUBLIC_DUNA_WEB_URL?.trim() || defaultWebUrl
).replace(/\/+$/, "");

export type DunaApiClient = TRPCClient<AppRouter>;
export type TokenGetter = () => Promise<string | null>;

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
