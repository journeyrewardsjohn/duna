import type { Metadata } from "next";
import { DiscoveryExperience } from "@/components/discovery-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { discoveryCollectionJsonLd } from "@/lib/discovery-seo";
import { serializeJsonLd } from "@/lib/pro-seo";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Discover beach volleyball",
  description:
    "Find public beach volleyball events, tournaments, leagues, matches, coaches, clubs, training, and court rentals near you on Duna.",
  alternates: {
    canonical: "/discover",
    types: { "text/markdown": "/discover.md" },
  },
  openGraph: {
    title: "Find your game · Duna",
    description:
      "Search public beach volleyball courts, events, tournaments, leagues, coaches, training, and matches.",
    type: "website",
    url: "/discover",
    siteName: "Duna",
  },
  twitter: {
    card: "summary",
    title: "Find your game · Duna",
    description:
      "Search public beach volleyball courts, events, coaches, training, and matches.",
  },
  robots: { index: true, follow: true },
};

export default async function DiscoverPage() {
  const caller = await getServerCaller();
  const discovery = await caller.public.discoveryMap();
  const firstMapped = discovery.items.find(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  );
  return (
    <>
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(discoveryCollectionJsonLd(discovery.items)),
        }}
        type="application/ld+json"
      />
      <DiscoveryExperience
        items={discovery.items}
        market={firstMapped?.subtitle ?? "Connected markets"}
      />
      <SiteFooter />
    </>
  );
}
