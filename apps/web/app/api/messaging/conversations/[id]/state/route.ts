import { loadDeliveryState } from "@duna/api/messaging-delivery";
import {
  integerQuery,
  messagingActorFromRequest,
  messagingErrorResponse,
  messagingPrincipalMode,
} from "../../../_route";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  const actor = await messagingActorFromRequest(request);
  if (!actor) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  try {
    return Response.json(
      await loadDeliveryState({
        actor,
        asPrincipal: messagingPrincipalMode(request),
        conversationId: id,
        since: url.searchParams.get("since") ?? undefined,
        limit: integerQuery(url.searchParams.get("limit")),
      }),
    );
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
