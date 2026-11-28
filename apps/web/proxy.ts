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
  // The method is a section of the Sand Rating page.
  "/methodology": "/sand-rating#method",
  "/methodology.md": "/sand-rating.md",
  // The features hub is the clubs page's "What Duna runs".
  "/run-your-club/features": "/run-your-club#features",
  "/run-your-club/features.md": "/run-your-club.md",
  // Training and the practice plan live on the coaches page.
  "/run-your-club/training": "/coaches#plan",
  "/run-your-club/training.md": "/coaches.md",
  "/run-your-club/training-os": "/coaches#plan",
  "/run-your-club/training-os.md": "/coaches.md",
  // Apple Watch is a section of the apps page.
  "/apps/apple-watch": "/apps#watch",
  "/apps/apple-watch.md": "/apps.md",
};

async function routeProxy(request: NextRequest): Promise<NextResponse> {
  const moved = movedPublicPages[request.nextUrl.pathname];
  if (moved) {
    const destination = request.nextUrl.clone();
    const [pathname, fragment] = moved.split("#");
    destination.pathname = pathname ?? moved;
    destination.hash = fragment ? `#${fragment}` : "";
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

  // `/app/discover` is the signed-in twin of `/discover` (SITE-4): it is
  // served in the Player shell, no longer redirected to the public page.

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
