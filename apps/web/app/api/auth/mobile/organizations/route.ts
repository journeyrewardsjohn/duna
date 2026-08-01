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
        userId: claims.sub!,
      });
    const organizations = await Promise.all(
      memberships.data.map(async (membership) => {
        const organization = await getWorkOS().organizations.getOrganization(
          membership.organizationId,
        );
        return { id: organization.id, name: organization.name };
      }),
    );
    return NextResponse.json(
      { organizations },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
}
