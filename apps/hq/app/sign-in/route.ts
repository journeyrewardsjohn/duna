import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { type NextRequest, NextResponse } from "next/server";

function safeReturnTo(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  if (!isWorkOSAuthKitConfigured()) {
    return NextResponse.json(
      { message: "Duna HQ sign-in is being configured." },
      { status: 503 },
    );
  }
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  return NextResponse.redirect(
    await getSignInUrl({
      redirectUri: new URL("/auth/callback", request.url).toString(),
      returnTo,
    }),
  );
}
