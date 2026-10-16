import { defineHook } from "eve/hooks";
import { recordAskDunaEvent } from "@duna/api";

export default defineHook({
  events: {
    async "*"(event, ctx) {
      const conversationId =
        ctx.session.auth.current?.attributes.conversationId;
      if (typeof conversationId !== "string") return;
      // Store useful receipts and final text; never persist hidden reasoning.
      if (
        ![
          "message.received",
          "message.completed",
          "turn.started",
          "turn.completed",
          "turn.failed",
          "turn.cancelled",
          "step.completed",
          "step.started",
        ].includes(event.type)
      )
        return;
      const data = event.data as unknown as Record<string, unknown>;
      await recordAskDunaEvent({
        id: event.meta.id,
        conversationId,
        type: event.type,
        data: {
          ...(typeof data.message === "string"
            ? {
                text: data.message,
                role: event.type === "message.received" ? "user" : "assistant",
              }
            : {}),
          ...(data.usage ? { usage: data.usage } : {}),
          ...(data.modelId ? { modelId: data.modelId } : {}),
          ...(data.turnId ? { turnId: data.turnId } : {}),
          ...(data.code ? { code: data.code } : {}),
        },
      });
    },
  },
});
