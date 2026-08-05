import { DiscoveryExperience } from "@/components/discovery-experience";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const caller = await getServerCaller();
  const [discovery, organizationWallets] = await Promise.all([
    caller.public.discoveryMap(),
    caller.player.organizationWallets().catch(() => []),
  ]);
  const homeOrganizationIds = organizationWallets
    .filter((wallet) => wallet.status !== "closed")
    .map((wallet) => wallet.organizationId);
  const firstMapped = discovery.items.find(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  );
  return (
    <DiscoveryExperience
      homeOrganizationIds={homeOrganizationIds}
      items={discovery.items}
      market={firstMapped?.subtitle ?? "Connected markets"}
    />
  );
}
