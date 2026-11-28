import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import {
  applyResponseHeaders,
  authkit,
  handleAuthkitProxy,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import { REQUEST_ID_HEADER, resolveEdgeRequestId } from "@duna/observability";
import { NextRequest, NextResponse } from "next/server";
import { isHiddenTidelineGalleryRoute } from "./app/tideline/gallery-guard";
import { isPublicHqRoute, routeMatches } from "./lib/public-routes";

async function routeProxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  // The Tideline gallery is development-only: a true 404 without its flag.
  if (isHiddenTidelineGalleryRoute(pathname)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "x-robots-tag": "noindex" },
    });
  }
  // These routes validate bearer credentials and tenant ownership themselves.
  // Eve also serves same-origin cookie clients through its signed session token.
  if (
    routeMatches(pathname, "/eve/v1") ||
    (routeMatches(pathname, "/api/ask-duna") &&
      request.headers.get("authorization")?.startsWith("Bearer "))
  ) {
    return NextResponse.next({ request: { headers: request.headers } });
  }
  if (!isWorkOSAuthKitConfigured()) {
    if (
      isPublicHqRoute(pathname) ||
      process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
    ) {
      return NextResponse.next({ request: { headers: request.headers } });
    }
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const result = await authkit(request, {
    redirectUri: new URL("/auth/callback", request.url).toString(),
  });
  if (!isPublicHqRoute(pathname) && !result.session.user) {
    if (routeMatches(pathname, "/api")) {
      const { responseHeaders } = partitionAuthkitHeaders(
        request,
        result.headers,
      );
      return applyResponseHeaders(
        new NextResponse(null, { status: 401 }),
        responseHeaders,
      );
    }
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "returnTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return handleAuthkitProxy(request, result.headers, { redirect: signIn });
  }
  if (
    result.session.user &&
    !result.session.organizationId &&
    !routeMatches(pathname, "/setup/start") &&
    !isPublicHqRoute(pathname)
  ) {
    return handleAuthkitProxy(request, result.headers, {
      redirect: new URL("/setup/start", request.url),
    });
  }
  return handleAuthkitProxy(request, result.headers);
}

/**
 * Every request gets one id at the edge (Duna Hosting's own id when present),
 * forwarded to the app in `x-request-id` and returned in the response
 * header, so a person's error reference finds the request in the logs.
 */
export default async function proxy(request: NextRequest) {
  const requestId = resolveEdgeRequestId(request.headers);
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  const response = await routeProxy(
    new NextRequest(request.url, { method: request.method, headers }),
  );
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
