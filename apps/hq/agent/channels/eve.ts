import { eveChannel } from "eve/channels/eve";
import { ForbiddenError } from "eve/channels/auth";
import {
  ASK_DUNA_MAX_TURN_BYTES,
  assertAskDunaAdmin,
  assertAskDunaEnabled,
  consumeRateLimit,
  getAskDunaConversation,
  resolveAskDunaActor,
} from "@duna/api";
import { readAskDunaJson } from "../../lib/ask-duna-http";
import { verifyAskDunaToken } from "../../lib/ask-duna-tokens";
import { validateAskDunaSessionBody } from "../../lib/ask-duna-input";

export default eveChannel({
  turnPolicy: "queue",
  auth: async (request) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return null;
    const claims = await verifyAskDunaToken(token);
    const actor = await resolveAskDunaActor(
      claims.sub,
      claims.organizationId,
      claims.purpose === "inspect",
    );
    const conversation = await getAskDunaConversation(
      actor,
      claims.conversationId,
      claims.purpose === "inspect",
    );
    const path = new URL(request.url).pathname;
    const match = path.match(
      /\/eve\/v1\/session(?:\/([^/]+))?(?:\/(stream|cancel|compact|clear|reset))?$/,
    );
    if (!match)
      throw new ForbiddenError({
        message: "This route is not available to Ask Duna clients.",
      });
    if (claims.purpose === "create") {
      if (request.method !== "POST" || match[1] || conversation.sessionId)
        throw new ForbiddenError({
          message: "Session creation is not allowed.",
        });
      const body = await readAskDunaJson(request.clone());
      if (
        body &&
        typeof body === "object" &&
        Object.keys(body).some((key) => key !== "title")
      )
        throw new ForbiddenError({
          message: "Session creation must not start a turn.",
        });
    } else {
      if (
        !claims.sessionId ||
        match[1] !== claims.sessionId ||
        conversation.sessionId !== claims.sessionId
      )
        throw new ForbiddenError({ message: "Conversation not found." });
      if (claims.purpose === "inspect") {
        assertAskDunaAdmin(actor);
        if (request.method !== "GET" || match[2] !== "stream")
          throw new ForbiddenError({
            message: "Super Admin inspection is read-only.",
          });
      } else if (request.method !== "GET") {
        if (
          (conversation.archivedAt && match[2] !== "cancel") ||
          ["clear", "reset"].includes(match[2] ?? "")
        )
          throw new ForbiddenError({
            message: "Start a new conversation to keep your history.",
          });
        if (match[2] !== "cancel") await assertAskDunaEnabled();
        const rate = await consumeRateLimit({
          key: `ask-duna:${actor.personId}`,
          capacity: 30,
          refillPerMinute: 10,
          now: new Date(),
        });
        if (!rate.allowed)
          throw new ForbiddenError({
            message: "Please wait a moment before sending another request.",
          });
        // Bound the actual received bytes, including requests without Content-Length.
        validateAskDunaSessionBody(
          await readAskDunaJson(request.clone(), ASK_DUNA_MAX_TURN_BYTES),
          match[2],
        );
      }
    }
    return {
      principalId: actor.personId,
      principalType: "user",
      authenticator: "duna",
      issuer: "duna-hq",
      attributes: {
        organizationId: claims.organizationId,
        conversationId: claims.conversationId,
        mode: claims.purpose,
      },
    };
  },
});
