import { permanentRedirect } from "next/navigation";
import { legacyDiscoverRedirect } from "@/components/discover/legacy-redirect";
import type { DiscoverQuery } from "@/components/discover/search-state";

/** The old signed-in map page: the same search on `/app/discover`, map view. */
export default async function AppDiscoverMapRedirect({
  searchParams,
}: {
  readonly searchParams: Promise<DiscoverQuery>;
}) {
  permanentRedirect(
    legacyDiscoverRedirect(await searchParams, "/app/discover", { map: true }),
  );
}
