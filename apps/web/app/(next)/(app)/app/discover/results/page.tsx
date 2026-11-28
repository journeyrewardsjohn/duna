import { permanentRedirect } from "next/navigation";
import { legacyDiscoverRedirect } from "@/components/discover/legacy-redirect";
import type { DiscoverQuery } from "@/components/discover/search-state";

/** The old signed-in results page: the same search on `/app/discover`. */
export default async function AppDiscoverResultsRedirect({
  searchParams,
}: {
  readonly searchParams: Promise<DiscoverQuery>;
}) {
  permanentRedirect(
    legacyDiscoverRedirect(await searchParams, "/app/discover"),
  );
}
