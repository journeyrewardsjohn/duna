import { defineTool } from "eve/tools";
import { z } from "zod";
import { listClubWebsites } from "@duna/api/website-service";
import { operatorForSession } from "../runtime";
export default defineTool({
  description:
    "Find the club's AI websites and open its conversational website studio. Use for building, redesigning or editing a club website. The studio accepts a brief and reference URLs, generates previews, manages credits, and requires explicit publishing review. This read-only tool does not publish, change domains or buy subscriptions.",
  inputSchema: z.object({}),
  label: { start: () => "Opening your website studio" },
  async execute(_input, ctx) {
    const { actor } = await operatorForSession(ctx);
    const sites = await listClubWebsites(actor);
    return {
      studio: "/website",
      websites: sites.map((site) => ({
        name: site.name,
        url: `/website?site=${site.id}`,
        status: site.provisioningStatus,
        published: Boolean(site.publishedRevisionId),
      })),
      guidance:
        "Open the studio link to describe the website or edit. First preview is free; publishing and further edits require the $200/month website subscription with 1,000 monthly credits. Standard edits use 25 credits. Keep running club programs, tournaments, leagues, courts and lessons in their existing workspaces.",
    };
  },
});
