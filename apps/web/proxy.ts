import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { authkit, handleAuthkitProxy } from "@workos-inc/authkit-nextjs";
import { REQUEST_ID_HEADER, resolveEdgeRequestId } from "@duna/observability";
import { NextRequest, NextResponse } from "next/server";

function isProtectedRoute(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

/**
 * Public addresses that moved (docs/design/website.md §2.2), each with its
 * Markdown companion. 301, query string kept.
 */
const movedPublicPages: Readonly<Record<string, string>> = {
  // The player landing page is the home page now.
  "/players": "/",
  "/players.md": "/index.md",
};

async function routeProxy(request: NextRequest): Promise<NextResponse> {
  const moved = movedPublicPages[request.nextUrl.pathname];
  if (moved) {
    const destination = request.nextUrl.clone();
    destination.pathname = moved;
    return NextResponse.redirect(destination, 301);
  }

  if (request.nextUrl.pathname.endsWith(".md")) {
    const markdown = request.nextUrl.clone();
    const canonicalPath = request.nextUrl.pathname.slice(0, -".md".length);
    markdown.pathname = "/api/public-markdown";
    markdown.searchParams.set("path", canonicalPath);

    const headers = new Headers(request.headers);
    headers.set("x-duna-markdown-path", canonicalPath);
    return NextResponse.rewrite(markdown, { request: { headers } });
  }

  if (
    request.nextUrl.pathname === "/app/discover" ||
    request.nextUrl.pathname.startsWith("/app/discover/")
  ) {
    const publicDiscover = request.nextUrl.clone();
    publicDiscover.pathname = request.nextUrl.pathname.replace(
      /^\/app\/discover/,
      "/discover",
    );
    return NextResponse.redirect(publicDiscover);
  }

  if (!isWorkOSAuthKitConfigured()) {
    if (
      isProtectedRoute(request.nextUrl.pathname) &&
      process.env.NEXT_PUBLIC_DEMO_MODE === "false"
    ) {
      const signIn = new URL("/sign-in", request.url);
      signIn.searchParams.set(
        "returnTo",
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(signIn);
    }
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const result = await authkit(request, {
    redirectUri: new URL("/auth/callback", request.url).toString(),
  });
  if (isProtectedRoute(request.nextUrl.pathname) && !result.session.user) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set(
      "returnTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return handleAuthkitProxy(request, result.headers, { redirect: signIn });
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
