import { openMessagingUpdatesStream } from "@duna/api/messaging-wakeups";
import { messagingActorFromRequest } from "../_route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const actor = await messagingActorFromRequest(request);
  if (!actor) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  return openMessagingUpdatesStream({ actor, signal: request.signal });
}
