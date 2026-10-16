import { defineTool } from "eve/tools";
import { z } from "zod";
import { askDunaOperationCatalog } from "@duna/api";
import { operatorForSession } from "../runtime";

export default defineTool({
  description:
    "Find Duna capabilities available to this operator. Search by topic such as calendar, event, member, training, money, audience, court, or catalog. Empty search lists all operation names.",
  inputSchema: z.object({ search: z.string().max(120).default("") }),
  label: { start: () => "Finding the right Duna tools" },
  async execute({ search }, ctx) {
    const { actor } = await operatorForSession(ctx);
    return askDunaOperationCatalog(actor, search);
  },
});
