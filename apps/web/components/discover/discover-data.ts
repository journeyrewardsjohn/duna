import "server-only";

import type { DiscoveryMapItem, VenueSummary } from "@duna/api";
import { report } from "@duna/observability";
import type { Metadata } from "next";
import { siteOgImage } from "@/components/site/og";
import { getServerCaller } from "@/lib/api";
import { type DiscoverResults, searchDiscover } from "./results";
import {
  type DiscoverQuery,
  type DiscoverState,
  discoverTitle,
  isDefaultSearch,
  parseDiscoverQuery,
} from "./search-state";

export interface DiscoverPageData {
  readonly state: DiscoverState;
  readonly results: DiscoverResults;
  readonly items: readonly DiscoveryMapItem[];
  readonly failure?: { readonly reference: string };
}

/**
 * The feed and the venues, read once per request: the same public
 * procedures the old pages called (`public.discoveryMap`, `public.venues`).
 * A failed feed is reported with a reference and the page still renders
 * its search, so the visitor can try again or search elsewhere.
 */
export async function loadDiscoverFeed(): Promise<{
  items: readonly DiscoveryMapItem[];
  venues: readonly VenueSummary[];
  failure?: { reference: string };
}> {
  try {
    const caller = await getServerCaller();
    const [discovery, venues] = await Promise.all([
      caller.public.discoveryMap(),
      caller.public.venues().catch(() => [] as VenueSummary[]),
    ]);
    return { items: discovery.items, venues };
  } catch (error) {
    const reference = report(error, { event: "web.discover.feed_failed" });
    return { items: [], venues: [], failure: { reference } };
  }
}

export async function loadDiscoverPage(
  query: DiscoverQuery,
  options: { readonly venueHref: (venueId: string) => string },
): Promise<DiscoverPageData> {
  const now = new Date();
  const state = parseDiscoverQuery(query, now);
  const feed = await loadDiscoverFeed();
  const results = searchDiscover(feed.items, feed.venues, state, {
    now,
    venueHref: options.venueHref,
  });
  return {
    state,
    results,
    items: feed.items,
    ...(feed.failure ? { failure: feed.failure } : {}),
  };
}

const description =
  "Find beach and indoor volleyball near you: open games, clinics, leagues, tournaments, court time and coaches, with times, prices and spots left.";

/** Titles and sharing for the search: the bare page is the indexable one. */
export function discoverMetadata(query: DiscoverQuery): Metadata {
  const state = parseDiscoverQuery(query);
  const landing = isDefaultSearch(state);
  const title =
    state.where.kind === "place" || state.where.kind === "text"
      ? `Find a game in ${
          state.where.kind === "place" ? state.where.label : state.where.text
        }`
      : "Find a game";
  const image = siteOgImage({
    title: landing ? "There's a game near you." : `${discoverTitle(state)}.`,
    eyebrow: "Find a game",
    concept: "club",
  });
  return {
    title,
    description,
    alternates: {
      canonical: "/discover",
      types: { "text/markdown": "/discover.md" },
    },
    robots: landing
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: `${title} · Duna`,
      description,
      type: "website",
      url: "/discover",
      siteName: "Duna",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Duna`,
      description,
      images: [image],
    },
  };
}
