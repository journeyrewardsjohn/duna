import type { MetadataRoute } from "next";
import { absolutePublicUrl } from "@/lib/pro-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/agents", "/llms.txt", "/api/mcp", "/api/og/pro"],
        disallow: [
          "/api/",
          "/app/",
          "/join/",
          "/sign-in",
          "/sign-up",
          "/watch/",
        ],
      },
    ],
    sitemap: absolutePublicUrl("/sitemap.xml"),
    host: absolutePublicUrl("/"),
  };
}
