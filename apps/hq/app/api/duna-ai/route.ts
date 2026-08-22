import {
  activeOrganizationIdFromCookie,
  confirmDunaAiAction,
  createApiContextFromRequest,
  createApiContextFromWorkOSSession,
  dunaAiRequestSchema,
  getDunaAiDashboardInsights,
  getDunaAiSuggestions,
  isWorkOSAuthKitConfigured,
  runDunaAiAgent,
} from "@duna/api";
import { withAuth } from "@workos-inc/authkit-nextjs";
function confirmationInput(
  value: unknown,
):
  | { readonly draftId: string; readonly confirmationNonce?: string }
  | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { mode?: unknown }).mode !== "confirm" ||
    typeof (value as { draftId?: unknown }).draftId !== "string"
  ) {
    return undefined;
  }
  const confirmationNonce = (value as { confirmationNonce?: unknown })
    .confirmationNonce;
  return typeof confirmationNonce === "string"
    ? { draftId: (value as { draftId: string }).draftId, confirmationNonce }
    : { draftId: (value as { draftId: string }).draftId };
}

async function actorFromRequest(request: Request) {
  const contextInput = {
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
  const configured = isWorkOSAuthKitConfigured();
  const bearerRequest = request.headers
    .get("authorization")
    ?.startsWith("Bearer ");
  const session = configured && !bearerRequest ? await withAuth() : undefined;
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
  return { actor: context.actor, context };
}

export async function POST(request: Request) {
  try {
    const requestOidcToken =
      request.headers.get("x-vercel-oidc-token")?.trim() || undefined;
    const body: unknown = await request.json();
    const { actor, context } = await actorFromRequest(request);
    if (!actor) {
      return Response.json(
        { error: "Sign in to use Duna AI." },
        { status: 401 },
      );
    }
    const confirmation = confirmationInput(body);
    if (confirmation) {
      const result = await confirmDunaAiAction({
        actor,
        draftId: confirmation.draftId,
        confirmationNonce: confirmation.confirmationNonce,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        now: context.now,
      });
      return Response.json({ result });
    }
    const input = dunaAiRequestSchema.parse(body);
    if (input.surface !== "hq") {
      return Response.json(
        { error: "This endpoint is for Duna HQ." },
        { status: 400 },
      );
    }
    if (input.mode === "suggestions") {
      return Response.json(
        await getDunaAiSuggestions({
          actor,
          surface: input.surface,
          page: input.page,
          context: input.context,
          requestOidcToken,
          now: context.now,
        }),
      );
    }
    if (input.mode === "insights") {
      return Response.json(
        await getDunaAiDashboardInsights({
          actor,
          requestOidcToken,
          now: context.now,
        }),
      );
    }
    const response = await runDunaAiAgent({
      actor,
      message: input.message,
      surface: input.surface,
      page: input.page,
      context: input.context,
      history: input.history,
      attachments: input.attachments,
      researchMode: input.researchMode,
      requestOidcToken,
      requestId: context.requestId,
      now: context.now,
    });
    return Response.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Duna AI is unavailable.";
    return Response.json({ error: message }, { status: 400 });
  }
}
