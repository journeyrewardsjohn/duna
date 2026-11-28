import type { Metadata } from "next";
import { DiscoveryResults } from "@/components/discovery-results";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import {
  discoveryCriteriaFromQuery,
  type DiscoveryQuery,
} from "@/lib/discovery-query";

export const metadata: Metadata = {
  title: "Beach volleyball search results",
  description: "Public beach volleyball search results on Duna.",
  alternates: { canonical: "/discover" },
  robots: { index: false, follow: true },
};

export default async function DiscoveryResultsPage({
  searchParams,
}: {
  readonly searchParams: Promise<DiscoveryQuery>;
}) {
  const params = await searchParams;
  const caller = await getServerCaller();
  const discovery = await caller.public.discoveryMap();
  return (
    <>
      <SiteHeader />
      <DiscoveryResults
        focus={typeof params.focus === "string" ? params.focus : undefined}
        initialCriteria={discoveryCriteriaFromQuery(params)}
        items={discovery.items}
      />
      <SiteFooter />
    </>
  );
}
