import { getAskDunaConversation, resolveAskDunaActor } from "@duna/api";

export async function operatorForSession(ctx: {
  session: {
    id: string;
    auth: {
      current: {
        principalId: string;
        attributes: Record<string, unknown>;
      } | null;
    };
  };
}) {
  const identity = ctx.session.auth.current;
  if (!identity || identity.attributes.mode !== "operate")
    throw new Error("An authorized operator is required.");
  const actor = await resolveAskDunaActor(
    identity.principalId,
    String(identity.attributes.organizationId),
  );
  const conversationId = String(identity.attributes.conversationId);
  const conversation = await getAskDunaConversation(actor, conversationId);
  if (conversation.sessionId !== ctx.session.id || conversation.archivedAt)
    throw new Error("This conversation cannot run tools.");
  return { actor, conversationId, conversation };
}
