import {
  resolveWorkOSCredentials,
  workOSAccessTokenExpiresAt,
} from "@duna/api";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      readonly code?: unknown;
      readonly codeVerifier?: unknown;
    };
    const code = typeof body.code === "string" ? body.code : "";
    const codeVerifier =
      typeof body.codeVerifier === "string" ? body.codeVerifier : "";
    const credentials = resolveWorkOSCredentials();
    if (
      !credentials ||
      code.length < 8 ||
      code.length > 4096 ||
      codeVerifier.length < 43 ||
      codeVerifier.length > 256
    ) {
      return NextResponse.json(
        { error: "Invalid authorization exchange." },
        { status: 400 },
      );
    }
    const session = await getWorkOS().userManagement.authenticateWithCode({
      clientId: credentials.clientId,
      code,
      codeVerifier,
    });
    return NextResponse.json(
      {
        accessToken: session.accessToken,
        expiresAt: workOSAccessTokenExpiresAt(session.accessToken),
        refreshToken: session.refreshToken,
        organizationId: session.organizationId,
        user: {
          email: session.user.email,
          firstName: session.user.firstName,
          id: session.user.id,
          lastName: session.user.lastName,
          profilePictureUrl: session.user.profilePictureUrl,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "The sign-in session could not be completed." },
      { status: 401 },
    );
  }
}
