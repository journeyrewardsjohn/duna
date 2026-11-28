import {
  createApiContextFromRequest,
  isWorkOSAuthKitConfigured,
  receiveClientErrors,
} from "@duna/api";
import { requestIdFromHeaders } from "@duna/observability";
import { getServerContext } from "@/lib/api";

/**
 * Error events from Duna's own clients (browser, Player, Pro). Native apps
 * send `Authorization: Bearer <access token>`; the browser uses its session.
 */
export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.startsWith("Bearer ");
  const ctx =
    bearer || !isWorkOSAuthKitConfigured()
      ? await createApiContextFromRequest(request, {
          requestId: requestIdFromHeaders(request.headers),
          ipAddress: request.headers
            .get("x-forwarded-for")
            ?.split(",")[0]
            ?.trim(),
          userAgent: request.headers.get("user-agent") ?? undefined,
        })
      : await getServerContext();
  return receiveClientErrors(request, ctx);
}
