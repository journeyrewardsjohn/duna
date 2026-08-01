import { clerkMiddleware } from "@clerk/nextjs/server";
import { resolveClerkCredentials } from "@duna/api/clerk-environment";
import { type NextRequest, NextResponse } from "next/server";

function routeMatches(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

function isPublicRoute(pathname: string): boolean {
  return (
    routeMatches(pathname, "/sign-in") ||
    routeMatches(pathname, "/sign-up") ||
    routeMatches(pathname, "/api/health")
  );
}

const clerkCredentials = resolveClerkCredentials();
const authenticatedProxy = clerkCredentials
  ? clerkMiddleware(
      async (auth, request) => {
        const pathname = request.nextUrl.pathname;
        const session = await auth();
        if (!isPublicRoute(pathname) && !session.userId) {
          if (routeMatches(pathname, "/api")) {
            return new NextResponse(null, { status: 401 });
          }
          return session.redirectToSignIn({ returnBackUrl: request.url });
        }
        if (
          session.userId &&
          !session.orgId &&
          !routeMatches(pathname, "/onboarding") &&
          !isPublicRoute(pathname)
        ) {
          return NextResponse.redirect(new URL("/onboarding", request.url));
        }
      },
      {
        publishableKey: clerkCredentials.publishableKey,
        secretKey: clerkCredentials.secretKey,
        signInUrl: "/sign-in",
        signUpUrl: "/sign-up",
      },
    )
  : undefined;

function authenticationSetupProxy(request: NextRequest) {
  if (isPublicRoute(request.nextUrl.pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export default authenticatedProxy
  ? authenticatedProxy
  : process.env.NEXT_PUBLIC_DEMO_MODE === "false"
    ? authenticationSetupProxy
    : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
