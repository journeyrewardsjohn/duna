import { clerkMiddleware } from "@clerk/nextjs/server";
import { resolveClerkCredentials } from "@duna/api/clerk-environment";
import { NextResponse } from "next/server";

const clerkCredentials = resolveClerkCredentials();
const authenticatedProxy = clerkCredentials
  ? clerkMiddleware(
      async (auth, request) => {
        const pathname = request.nextUrl.pathname;
        if (pathname === "/app" || pathname.startsWith("/app/")) {
          await auth.protect();
        }
      },
      {
        publishableKey: clerkCredentials.publishableKey,
        secretKey: clerkCredentials.secretKey,
      },
    )
  : undefined;

export default authenticatedProxy ?? (() => NextResponse.next());

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
