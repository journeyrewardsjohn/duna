import type { MetadataRoute } from "next";
import { getServerCaller } from "@/lib/api";
import { absolutePublicUrl } from "@/lib/pro-seo";

export const revalidate = 3_600;

const publicPages = [
  "",
  "/pro",
  "/about",
  "/methodology",
  "/run-your-club",
  "/safety",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const coverage = await getServerCaller()
    .then((caller) => caller.public.proCoverage())
    .catch(() => undefined);
  const staticEntries: MetadataRoute.Sitemap = publicPages.map((path) => ({
    url: absolutePublicUrl(path || "/"),
    changeFrequency: path === "/pro" ? "hourly" : "weekly",
    priority: path === "" ? 1 : path === "/pro" ? 0.9 : 0.6,
  }));
  const eventEntries: MetadataRoute.Sitemap = (coverage?.events ?? []).map(
    (event) => ({
      url: absolutePublicUrl(`/events/${event.slug}`),
      lastModified: new Date(event.lastSyncedAt),
      changeFrequency: event.live ? "always" : "daily",
      priority: event.live ? 1 : event.status === "upcoming" ? 0.9 : 0.72,
    }),
  );
  const matchEntries: MetadataRoute.Sitemap = (coverage?.matches ?? []).flatMap(
    (match) =>
      match.canonicalPath
        ? [
            {
              url: absolutePublicUrl(match.canonicalPath),
              ...(match.playedAt
                ? { lastModified: new Date(match.playedAt) }
                : {}),
              changeFrequency: match.status === "live" ? "always" : "weekly",
              priority: match.status === "live" ? 0.9 : 0.65,
            } as const,
          ]
        : [],
  );
  return [...staticEntries, ...eventEntries, ...matchEntries];
}
