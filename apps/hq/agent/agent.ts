import { defineAgent, defineDynamic } from "eve";
import {
  ASK_DUNA_FAST_MODEL,
  ASK_DUNA_MODEL,
  askDunaEffortSchema,
  assertAskDunaEnabled,
  getAskDunaConversation,
  resolveAskDunaActor,
} from "@duna/api";

export default defineAgent({
  defaultTools: false,
  model: defineDynamic({
    events: {
      async "turn.started"(_event, ctx) {
        await assertAskDunaEnabled();
        const identity = ctx.session.auth.current;
        if (!identity || identity.attributes.mode !== "operate")
          throw new Error("An operator session is required.");
        const actor = await resolveAskDunaActor(
          identity.principalId,
          String(identity.attributes.organizationId),
        );
        const conversation = await getAskDunaConversation(
          actor,
          String(identity.attributes.conversationId),
        );
        const effort = askDunaEffortSchema.parse(conversation.effort);
        const reasoning = {
          fast: "low",
          medium: "medium",
          high: "high",
          max: "xhigh",
          ultra: "xhigh",
        } as const;
        return {
          model:
            effort === "fast"
              ? process.env.DUNA_ASK_FAST_MODEL || ASK_DUNA_FAST_MODEL
              : effort === "ultra"
                ? process.env.DUNA_ASK_ULTRA_MODEL || "openai/gpt-6-astra"
                : process.env.DUNA_ASK_MODEL || ASK_DUNA_MODEL,
          reasoning: reasoning[effort],
        };
      },
    },
  }),
  limits: {
    maxInputTokensPerSession: 1_000_000,
    maxOutputTokensPerSession: 80_000,
    maxTokenCostUsdPerSession: 10,
    sessionTimeoutMs: false,
  },
});
