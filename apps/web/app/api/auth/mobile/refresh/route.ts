import {
  resolveWorkOSCredentials,
  workOSAccessTokenExpiresAt,
} from "@duna/api";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      readonly organizationId?: unknown;
      readonly refreshToken?: unknown;
    };
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken : "";
    const organizationId =
      typeof body.organizationId === "string" ? body.organizationId : undefined;
    const credentials = resolveWorkOSCredentials();
    if (!credentials || refreshToken.length < 8 || refreshToken.length > 4096) {
      return NextResponse.json(
        { error: "Invalid refresh request." },
        { status: 400 },
      );
    }
    const session =
      await getWorkOS().userManagement.authenticateWithRefreshToken({
        clientId: credentials.clientId,
        organizationId,
        refreshToken,
      });
    return NextResponse.json(
      {
        accessToken: session.accessToken,
        expiresAt: workOSAccessTokenExpiresAt(session.accessToken),
        refreshToken: session.refreshToken,
        organizationId: session.organizationId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "The session could not be refreshed." },
      { status: 401 },
    );
  }
}
