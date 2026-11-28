import "@/components/discover/discover.css";

import type { Metadata } from "next";
import { loadDiscoverPage } from "@/components/discover/discover-data";
import { DiscoverView } from "@/components/discover/discover-view";
import { mapPresence } from "@/components/discover/map-presence.server";
import type { DiscoverQuery } from "@/components/discover/search-state";

export const metadata: Metadata = { title: "Find a game" };

/**
 * Find a game inside the Player shell (`/app/discover`): the same search and
 * results as `/discover`, with venues opening their signed-in page (booking).
 */
export default async function AppDiscoverPage({
  searchParams,
}: {
  readonly searchParams: Promise<DiscoverQuery>;
}) {
  const map = await mapPresence();
  const data = await loadDiscoverPage(await searchParams, {
    venueHref: (venueId) => `/app/venues/${venueId}`,
  });
  return (
    <div className="dv-app">
      <DiscoverView
        basePath="/app/discover"
        failure={data.failure}
        map={map}
        results={data.results}
        state={data.state}
      />
    </div>
  );
}
