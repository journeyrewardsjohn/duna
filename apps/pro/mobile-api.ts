import type { AppRouter } from "@duna/api";
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
export const dunaHqUrl = (
  process.env.EXPO_PUBLIC_DUNA_HQ_URL?.trim() || defaultWebUrl
).replace(/\/+$/, "");

export type DunaApiClient = TRPCClient<AppRouter>;
export type TokenGetter = () => Promise<string | null>;

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
