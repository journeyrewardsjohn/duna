import {
  activeOrganizationIdFromCookie,
  createApiContextFromRequest,
  createApiContextFromWorkOSSession,
  isWorkOSAuthKitConfigured,
  MessagingError,
  type ApiActor,
  type MessagingPrincipalMode,
} from "@duna/api";
import { withAuth } from "@workos-inc/authkit-nextjs";

export async function messagingActorFromRequest(
  request: Request,
): Promise<ApiActor | undefined> {
  const configured = isWorkOSAuthKitConfigured();
  const bearerRequest = request.headers
    .get("authorization")
    ?.startsWith("Bearer ");
  const session = configured && !bearerRequest ? await withAuth() : undefined;
  const contextInput = {
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
  const context = bearerRequest
    ? await createApiContextFromRequest(request, contextInput)
    : configured
      ? await createApiContextFromWorkOSSession(
          {
            user: session?.user,
            organizationId: session?.organizationId,
            role: session?.role,
            roles: session?.roles,
            dunaOrganizationId: activeOrganizationIdFromCookie(
              request.headers.get("cookie"),
            ),
          },
          contextInput,
        )
      : await createApiContextFromRequest(request, contextInput);
  return context.actor;
}

export function messagingPrincipalMode(
  request: Request,
  fallback: MessagingPrincipalMode = "user",
): MessagingPrincipalMode {
  return new URL(request.url).searchParams.get("asPrincipal") === "organization"
    ? "organization"
    : fallback;
}

export function messagingErrorResponse(error: unknown): Response {
  if (error instanceof MessagingError) {
    const status =
      error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "PRECONDITION_FAILED"
            ? 412
            : 400;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(
    { error: "Messaging is temporarily unavailable." },
    { status: 500 },
  );
}

export function integerQuery(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}
