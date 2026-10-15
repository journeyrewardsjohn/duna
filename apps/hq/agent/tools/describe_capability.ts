import { defineTool } from "eve/tools";
import { z } from "zod";
import { describeAskDunaOperation } from "@duna/api";
import { operatorForSession } from "../runtime";

export default defineTool({
  description:
    "Get the authoritative input schema and review policy for a Duna capability before using it.",
  inputSchema: z.object({ operation: z.string() }),
  label: { start: () => "Checking what this action needs" },
  async execute({ operation }, ctx) {
    const { actor } = await operatorForSession(ctx);
    return describeAskDunaOperation(actor, operation);
  },
});
