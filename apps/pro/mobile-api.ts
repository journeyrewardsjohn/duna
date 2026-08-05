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
export const dunaApiBaseUrl = dunaApiUrl.replace(/\/api\/trpc$/, "");
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
