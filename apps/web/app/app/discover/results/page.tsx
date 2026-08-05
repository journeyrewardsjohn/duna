import { DiscoveryResults } from "@/components/discovery-results";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Discovery results" };

export default async function DiscoveryResultsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const caller = await getServerCaller();
  const discovery = await caller.public.discoveryMap();
  return (
    <DiscoveryResults
      initialKind={typeof params.kind === "string" ? params.kind : undefined}
      initialQuery={typeof params.q === "string" ? params.q : ""}
      initialScope={typeof params.scope === "string" ? params.scope : undefined}
      initialType={typeof params.type === "string" ? params.type : undefined}
      items={discovery.items}
    />
  );
}
