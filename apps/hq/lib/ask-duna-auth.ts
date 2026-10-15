import {
  activeOrganizationIdFromCookie,
  createApiContextFromRequest,
  createApiContextFromWorkOSSession,
  isWorkOSAuthKitConfigured,
} from "@duna/api";
import { withAuth } from "@workos-inc/authkit-nextjs";

export async function askDunaRequestContext(request: Request) {
  const input = {
    requestId: crypto.randomUUID(),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
  if (
    request.headers.get("authorization")?.startsWith("Bearer ") ||
    !isWorkOSAuthKitConfigured()
  )
    return createApiContextFromRequest(request, input);
  const session = await withAuth();
  return createApiContextFromWorkOSSession(
    {
      user: session.user,
      organizationId: session.organizationId,
      role: session.role,
      roles: session.roles,
      dunaOrganizationId: activeOrganizationIdFromCookie(
        request.headers.get("cookie"),
      ),
    },
    input,
  );
}
