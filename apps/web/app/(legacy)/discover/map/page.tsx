import type { Metadata } from "next";
import { DiscoveryPageHeader } from "@/components/discovery-page-header";
import { DiscoveryMap } from "@/components/discovery-map";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import {
  discoveryCriteriaFromQuery,
  discoveryCriteriaToQuery,
  type DiscoveryQuery,
} from "@/lib/discovery-query";
import {
  discoveryResultSummary,
  discoveryWhatLabel,
  discoveryWhenLabel,
  runDiscoverySearch,
} from "@duna/api";

export const metadata: Metadata = {
  title: "Beach volleyball map",
  description:
    "Explore public beach volleyball courts, events, coaches, clubs, and matches on the Duna map.",
  alternates: { canonical: "/discover" },
  robots: { index: false, follow: true },
};

export default async function DiscoveryMapPage({
  searchParams,
}: {
  readonly searchParams: Promise<DiscoveryQuery>;
}) {
  const query = await searchParams;
  const criteria = discoveryCriteriaFromQuery(query);
  const caller = await getServerCaller();
  const discovery = await caller.public.discoveryMap();
  const result = runDiscoverySearch(discovery.items, criteria);
  const serialized = discoveryCriteriaToQuery(criteria);
  return (
    <>
      <SiteHeader />
      <main
        className="discover-v2-map-page discover-public discover-map-results"
        data-zone="editorial"
      >
        <DiscoveryPageHeader
          locationLabel={criteria.location.label}
          resultSummary={discoveryResultSummary(result)}
          title="Explore beach volleyball."
          view="map"
          viewHref={`/discover/results?${serialized}`}
          whatLabel={discoveryWhatLabel(criteria.what)}
          whenLabel={discoveryWhenLabel(criteria.when)}
        />
        <DiscoveryMap
          full
          items={result.items}
          origin={result.origin}
          radiusMiles={result.radiusMiles}
          summary={discoveryResultSummary(result)}
        />
      </main>
      <SiteFooter />
    </>
  );
}
