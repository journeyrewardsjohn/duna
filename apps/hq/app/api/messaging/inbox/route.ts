import { loadDeliveryInbox, loadDunaSupportQueue } from "@duna/api";
import {
  integerQuery,
  messagingActorFromRequest,
  messagingErrorResponse,
  messagingPrincipalMode,
} from "../_route";

export async function GET(request: Request) {
  const actor = await messagingActorFromRequest(request);
  if (!actor) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("queue") === "support") {
      return Response.json({
        items: await loadDunaSupportQueue({ actor }),
        nextCursor: null,
        serverTime: new Date().toISOString(),
      });
    }
    return Response.json(
      await loadDeliveryInbox({
        actor,
        asPrincipal: messagingPrincipalMode(request),
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: integerQuery(url.searchParams.get("limit")),
      }),
    );
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
