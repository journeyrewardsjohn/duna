import { ArrowLeft, ListFilter } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
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
      <main className="discover-v2-map-page discover-public discover-map-results">
        <header>
          <Link href="/discover">
            <ArrowLeft aria-hidden size={17} /> Edit search
          </Link>
          <div>
            <span>MAP + RESULTS</span>
            <h1>{criteria.location.label}</h1>
            <p>
              {discoveryWhenLabel(criteria.when)} ·{" "}
              {discoveryWhatLabel(criteria.what)} ·{" "}
              {discoveryResultSummary(result)}
            </p>
          </div>
          <Link
            className="discover-v2-map-button"
            href={`/discover/results?${serialized}`}
          >
            <ListFilter aria-hidden size={17} /> List
          </Link>
        </header>
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
