import { defineTool } from "eve/tools";
import { z } from "zod";
import { readAskDunaOperation } from "@duna/api";
import { operatorForSession } from "../runtime";

export default defineTool({
  description:
    "Read current Duna records through an authorized query. Cannot execute mutations. Describe the capability first and use its exact input schema. operator.workspace includes the complete organizationSetup checklist used by HQ, even when workspace records are truncated.",
  inputSchema: z.object({
    operation: z.string(),
    input: z.record(z.string(), z.unknown()).default({}),
  }),
  label: { start: () => "Reading your Duna workspace" },
  async execute({ operation, input }, ctx) {
    const { actor } = await operatorForSession(ctx);
    return readAskDunaOperation(actor, operation, input);
  },
});
