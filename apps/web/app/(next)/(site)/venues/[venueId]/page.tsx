import "@/components/discover/discover.css";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localVenueStart } from "@/components/discover/venue-time";
import { loadVenuePage } from "@/components/discover/venue-data";
import { VenueView } from "@/components/discover/venue-view";
import { mapPresence } from "@/components/discover/map-presence.server";
import { siteOgImage } from "@/components/site/og";
import {
  discoveryItemJsonLd,
  venueJsonLd,
  venueSummaryJsonLd,
} from "@/lib/discovery-seo";
import { serializeJsonLd } from "@/lib/pro-seo";

type Props = { readonly params: Promise<{ venueId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { venueId } = await params;
  const venue = await loadVenuePage(venueId, "/venues");
  if (!venue) return { title: "Venue not found", robots: { index: false } };
  const canonical = `/venues/${venue.id}`;
  const description =
    venue.description ??
    `${venue.name} in ${venue.city}, ${venue.region}: ${venue.courtCount} ${
      venue.courtCount === 1 ? "court" : "courts"
    }, what's on this week, and how to book or join a game on Duna.`;
  const image =
    venue.imageUrl ??
    siteOgImage({
      title: venue.name,
      eyebrow: `Courts · ${venue.city}`,
      concept: "club",
    });
  return {
    title: `${venue.name} volleyball courts`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${venue.name} · Duna`,
      description,
      type: "website",
      url: canonical,
      siteName: "Duna",
      images: [{ url: image, alt: venue.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${venue.name} · Duna`,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
    ...(venue.latitude !== undefined && venue.longitude !== undefined
      ? {
          other: {
            "geo.position": `${venue.latitude};${venue.longitude}`,
            ICBM: `${venue.latitude}, ${venue.longitude}`,
          },
        }
      : {}),
  };
}

/**
 * A venue, public (`/venues/[venueId]`). Visitors browse days, times and
 * prices; booking or joining goes through sign-in and comes back to the
 * signed-in twin (`/app/venues/[venueId]`) with the same choice.
 */
export default async function PublicVenuePage({ params }: Props) {
  const { venueId } = await params;
  const venue = await loadVenuePage(venueId, "/venues");
  if (!venue) notFound();
  const map = await mapPresence();
  const graph = venue.inventory
    ? venueJsonLd(venue.inventory)
    : venueSummaryJsonLd(venue.summary!);
  const jsonLd =
    typeof graph === "object" && graph && "@graph" in graph
      ? {
          ...graph,
          "@graph": [
            ...((graph as { "@graph": readonly unknown[] })["@graph"] ?? []),
            ...venue.events.map(discoveryItemJsonLd),
          ],
        }
      : graph;
  return (
    <main className="vn-main-wrap" id="main" tabIndex={-1}>
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd as never) }}
        type="application/ld+json"
      />
      <div className="site-wrap">
        <VenueView
          booking={{
            mode: "guest",
            defaultLocalStartsAt: localVenueStart(venue.timezone),
          }}
          discoverPath="/discover"
          map={map}
          venue={venue}
        />
      </div>
    </main>
  );
}
