import "@/components/discover/discover.css";

import type { Metadata } from "next";
import {
  discoverMetadata,
  loadDiscoverPage,
} from "@/components/discover/discover-data";
import { DiscoverView } from "@/components/discover/discover-view";
import type { DiscoverQuery } from "@/components/discover/search-state";
import { discoveryCollectionJsonLd } from "@/lib/discovery-seo";
import { serializeJsonLd } from "@/lib/pro-seo";

type Props = { readonly searchParams: Promise<DiscoverQuery> };

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  return discoverMetadata(await searchParams);
}

/**
 * Find a game (`/discover`): Where · When · What in the address, the first
 * results rendered here on the server, then every change pushed without a
 * full reload (components/discover). Old `/discover/results` and
 * `/discover/map` addresses land here with their query strings.
 */
export default async function DiscoverPage({ searchParams }: Props) {
  const data = await loadDiscoverPage(await searchParams, {
    venueHref: (venueId) => `/venues/${venueId}`,
  });
  return (
    <main className="dv-main" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(discoveryCollectionJsonLd(data.items)),
        }}
        type="application/ld+json"
      />
      <DiscoverView
        basePath="/discover"
        failure={data.failure}
        results={data.results}
        state={data.state}
      />
    </main>
  );
}
