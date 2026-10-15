import { defineTool } from "eve/tools";
import { z } from "zod";
import { listAskDunaActions } from "@duna/api";
import { operatorForSession } from "../runtime";

export default defineTool({
  description:
    "Read saved action statuses and receipts. A pending proposal has not run. An uncertain outcome must be investigated before another attempt.",
  inputSchema: z.object({}),
  label: { start: () => "Checking saved action results" },
  async execute(_input, ctx) {
    const { actor, conversationId } = await operatorForSession(ctx);
    return listAskDunaActions(actor, conversationId);
  },
});
