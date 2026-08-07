import type { MetadataRoute } from "next";
import { getServerCaller } from "@/lib/api";
import { staticPublicPages } from "@/lib/public-markdown";
import { absolutePublicUrl } from "@/lib/pro-seo";

export const revalidate = 3_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const caller = await getServerCaller();
  const [coverage, rankings, events, coaches, professionalTeams] =
    await Promise.all([
      caller.public.proCoverage().catch(() => undefined),
      caller.public.worldRankings().catch(() => undefined),
      caller.public.events().catch(() => []),
      caller.public.coaches().catch(() => []),
      caller.public.proTeams().catch(() => []),
    ]);

  const organizationSlugs = [
    ...new Set([
      ...events.flatMap((event) =>
        event.organizationSlug ? [event.organizationSlug] : [],
      ),
      ...coaches.map((coach) => coach.organizationSlug),
    ]),
  ];
  const storefronts = (
    await Promise.all(
      organizationSlugs.map((slug) =>
        caller.public.organizationStorefront({ slug }).catch(() => undefined),
      ),
    )
  ).filter((storefront) => storefront !== undefined);

  const staticEntries: MetadataRoute.Sitemap = [
    ...staticPublicPages.map((page) => ({
      url: absolutePublicUrl(page.path),
      changeFrequency:
        page.path === "/pro" ? ("hourly" as const) : ("weekly" as const),
      priority: page.path === "/" ? 1 : page.path === "/pro" ? 0.9 : 0.6,
    })),
    {
      url: absolutePublicUrl("/agents"),
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];
  const consumerEventEntries: MetadataRoute.Sitemap = events.map((event) => ({
    url: absolutePublicUrl(`/events/${event.slug}`),
    changeFrequency: event.live ? "always" : "daily",
    priority: event.live ? 1 : 0.82,
  }));
  const professionalEventEntries: MetadataRoute.Sitemap = (
    coverage?.events ?? []
  ).map((event) => ({
    url: absolutePublicUrl(`/events/${event.slug}`),
    lastModified: new Date(event.lastSyncedAt),
    changeFrequency: event.live ? "always" : "daily",
    priority: event.live ? 1 : event.status === "upcoming" ? 0.9 : 0.72,
  }));
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
  const rankedProfiles = [
    ...(rankings?.world.men ?? []),
    ...(rankings?.world.women ?? []),
    ...(rankings?.duna.men ?? []),
    ...(rankings?.duna.women ?? []),
  ];
  const playerEntries: MetadataRoute.Sitemap = [
    ...new Map(
      rankedProfiles.flatMap((player) =>
        player.publicPath ? [[player.publicPath, player] as const] : [],
      ),
    ).keys(),
  ].map((publicPath) => ({
    url: absolutePublicUrl(publicPath),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  const teamEntries: MetadataRoute.Sitemap = professionalTeams.map((team) => ({
    url: absolutePublicUrl(`/pro/teams/${team.teamNo}`),
    changeFrequency: "weekly",
    priority: 0.66,
  }));
  const coachEntries: MetadataRoute.Sitemap = coaches.map((coach) => ({
    url: absolutePublicUrl(`/coaches/${coach.handle}`),
    changeFrequency: "weekly",
    priority: 0.65,
  }));
  const organizationEntries: MetadataRoute.Sitemap = organizationSlugs.map(
    (slug) => ({
      url: absolutePublicUrl(`/clubs/${slug}`),
      changeFrequency: "weekly",
      priority: 0.72,
    }),
  );
  const storefrontEntries: MetadataRoute.Sitemap = storefronts.flatMap(
    (storefront) =>
      storefront.catalog.map((item) => ({
        url: absolutePublicUrl(
          `/clubs/${storefront.slug}/products/${item.slug}`,
        ),
        changeFrequency: "weekly" as const,
        priority: 0.64,
      })),
  );

  const entries = [
    ...staticEntries,
    ...consumerEventEntries,
    ...professionalEventEntries,
    ...matchEntries,
    ...playerEntries,
    ...teamEntries,
    ...coachEntries,
    ...organizationEntries,
    ...storefrontEntries,
  ];
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
