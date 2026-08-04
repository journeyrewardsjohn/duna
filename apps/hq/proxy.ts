import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import {
  applyResponseHeaders,
  authkit,
  handleAuthkitProxy,
  partitionAuthkitHeaders,
} from "@workos-inc/authkit-nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { isPublicHqRoute, routeMatches } from "./lib/public-routes";

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!isWorkOSAuthKitConfigured()) {
    if (
      isPublicHqRoute(pathname) ||
      process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
    ) {
      return NextResponse.next();
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
    !routeMatches(pathname, "/onboarding") &&
    !isPublicHqRoute(pathname)
  ) {
    return handleAuthkitProxy(request, result.headers, {
      redirect: new URL("/onboarding", request.url),
    });
  }
  return handleAuthkitProxy(request, result.headers);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
