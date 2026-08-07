import {
  publicMarkdownHeaders,
  renderAgentsGuide,
} from "@/lib/public-markdown";
import { absolutePublicUrl } from "@/lib/pro-seo";

export const revalidate = 86_400;

export function GET(): Response {
  return new Response(renderAgentsGuide(), {
    headers: {
      ...publicMarkdownHeaders,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      Link: `<${absolutePublicUrl("/agents")}>; rel="canonical"`,
    },
  });
}
