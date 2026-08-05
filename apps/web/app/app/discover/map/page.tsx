import { DiscoveryMap } from "@/components/discovery-map";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Explore the map" };

export default async function DiscoveryMapPage() {
  const caller = await getServerCaller();
  const discovery = await caller.public.discoveryMap();
  return (
    <main className="discover-v2-map-page">
      <header>
        <div>
          <span>GLOBAL DISCOVERY</span>
          <h1>Move the world. Find your game.</h1>
        </div>
        <p>Zoom, pan, filter, then search the area in view.</p>
      </header>
      <DiscoveryMap full items={discovery.items} />
    </main>
  );
}
