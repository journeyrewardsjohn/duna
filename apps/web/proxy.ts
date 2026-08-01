import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { authkit, handleAuthkitProxy } from "@workos-inc/authkit-nextjs";
import { type NextRequest, NextResponse } from "next/server";

function isProtectedRoute(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export default async function proxy(request: NextRequest) {
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
