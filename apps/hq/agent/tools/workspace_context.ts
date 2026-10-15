import { defineTool } from "eve/tools";
import { z } from "zod";
import { operatorForSession } from "../runtime";

export default defineTool({
  description:
    "Get the current operator, selected organization, originating Duna page and current UTC time. Call this at the beginning of a conversation. Read workspace and related records for timezone and details.",
  inputSchema: z.object({}),
  label: { start: () => "Getting your workspace context" },
  async execute(_input, ctx) {
    const { actor, conversation } = await operatorForSession(ctx);
    return {
      operatorName: actor.displayName,
      organizationId: actor.organizationId,
      originatingPage: conversation.page,
      now: new Date().toISOString(),
    };
  },
});
