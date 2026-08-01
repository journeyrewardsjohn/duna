import {
  createApiContextFromRequest,
  createApiContextFromWorkOSSession,
  createCaller,
  isWorkOSAuthKitConfigured,
} from "@duna/api";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { headers } from "next/headers";
import { cache } from "react";

function requestUrl(headersValue: Headers): string {
  const protocol = headersValue.get("x-forwarded-proto") ?? "https";
  const host =
    headersValue.get("x-forwarded-host") ??
    headersValue.get("host") ??
    "duna.local";
  return `${protocol}://${host}/`;
}

export const getServerCaller = cache(async () => {
  const incoming = await headers();
  const requestHeaders = new Headers();
  incoming.forEach((value, key) => requestHeaders.set(key, value));
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const request = new Request(requestUrl(requestHeaders), {
    headers: requestHeaders,
  });
  const contextInput = {
    requestId: requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress: forwardedFor?.split(",")[0]?.trim(),
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
  const configured = isWorkOSAuthKitConfigured();
  const workosSession = configured ? await withAuth() : undefined;
  const context = configured
    ? await createApiContextFromWorkOSSession(
        {
          user: workosSession?.user,
          organizationId: workosSession?.organizationId,
          role: workosSession?.role,
          roles: workosSession?.roles,
        },
        contextInput,
      )
    : await createApiContextFromRequest(request, contextInput);
  return createCaller(context);
});
