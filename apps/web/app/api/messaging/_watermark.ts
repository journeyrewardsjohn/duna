import { advanceDeliveryWatermark } from "@duna/api/messaging-delivery";
import {
  messagingActorFromRequest,
  messagingErrorResponse,
  messagingPrincipalMode,
} from "./_route";

export async function postMessagingWatermark(
  request: Request,
  conversationId: string,
  kind: "delivered" | "read",
) {
  const actor = await messagingActorFromRequest(request);
  if (!actor) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { readonly seq?: unknown };
    return Response.json(
      await advanceDeliveryWatermark({
        actor,
        asPrincipal: messagingPrincipalMode(request),
        conversationId,
        kind,
        seq: typeof body.seq === "number" ? body.seq : Number.NaN,
      }),
    );
  } catch (error) {
    return messagingErrorResponse(error);
  }
}
