import { verifyWorkOSAccessToken } from "@duna/api";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const claims = await verifyWorkOSAccessToken(
      authorization.slice("Bearer ".length),
    );
    const memberships =
      await getWorkOS().userManagement.listOrganizationMemberships({
        limit: 100,
        statuses: ["active"],
        userId: claims.sub!,
      });
    const organizations = memberships.data.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
      role: membership.role.slug,
    }));
    return NextResponse.json(
      { organizations },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
}
