import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { authkit, handleAuthkitProxy } from "@workos-inc/authkit-nextjs";
import { type NextRequest, NextResponse } from "next/server";

function isProtectedRoute(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export default async function proxy(request: NextRequest) {
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
    return NextResponse.next();
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

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
