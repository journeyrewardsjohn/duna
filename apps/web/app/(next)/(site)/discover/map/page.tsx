import { permanentRedirect } from "next/navigation";
import { legacyDiscoverRedirect } from "@/components/discover/legacy-redirect";
import type { DiscoverQuery } from "@/components/discover/search-state";

/** The old map page: the same search on `/discover`, map view (website.md 2.2). */
export default async function DiscoverMapRedirect({
  searchParams,
}: {
  readonly searchParams: Promise<DiscoverQuery>;
}) {
  permanentRedirect(
    legacyDiscoverRedirect(await searchParams, "/discover", { map: true }),
  );
}
