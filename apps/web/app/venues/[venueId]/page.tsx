import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowRight, Clock3, MapPin, Waves } from "lucide-react";
import { CourtBookingPanel } from "@/components/court-booking-panel";
import { VenueLayoutViewer } from "@/components/venue-layout-viewer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { serializeJsonLd } from "@/lib/pro-seo";
import { venueJsonLd, venueSummaryJsonLd } from "@/lib/discovery-seo";

const loadVenuePage = cache(async (venueId: string) => {
  const caller = await getServerCaller();
  const [inventory, venues, layout] = await Promise.all([
    caller.public.courtBookingInventory({ venueId }).catch(() => undefined),
    caller.public.venues().catch(() => []),
    caller.public.venueLayout({ venueId }).catch(() => undefined),
  ]);
  return {
    inventory,
    layout,
    summary: venues.find((venue) => venue.id === venueId),
  };
});

function defaultVenueStart(timeZone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T10:00`;
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ venueId: string }>;
}): Promise<Metadata> {
  const { venueId } = await params;
  const { inventory, summary } = await loadVenuePage(venueId);
  const venue = inventory?.venue ?? summary;
  if (!venue) return { title: "Venue not found" };
  const canonical = `/venues/${venue.id}`;
  const description =
    inventory?.venue.description ??
    (inventory
      ? `See beach volleyball court details, amenities, prices, and live availability at ${venue.name} in ${venue.city}, ${venue.region}.`
      : `Explore ${venue.name}, a ${summary!.courtCount}-court beach volleyball location in ${venue.city}, ${venue.region}.`);
  const imageUrl = inventory?.venue.heroImageUrl ?? summary?.imageUrl;
  return {
    title: `${venue.name} beach volleyball courts`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${venue.name} · Duna courts`,
      description,
      type: "website",
      url: canonical,
      images: imageUrl ? [{ url: imageUrl, alt: venue.name }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: `${venue.name} · Duna courts`,
      description,
      images: imageUrl ? [imageUrl] : undefined,
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

export default async function PublicVenuePage({
  params,
}: {
  readonly params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const { inventory, summary, layout } = await loadVenuePage(venueId);
  if (!inventory && !summary) notFound();
  const venue = inventory?.venue ?? summary!;
  const returnTo = `/app/venues/${venue.id}`;
  const authenticationHref = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <>
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            inventory ? venueJsonLd(inventory) : venueSummaryJsonLd(summary!),
          ),
        }}
        type="application/ld+json"
      />
      {inventory ? (
        <main className="standard-page court-booking-page public-venue-page">
          <CourtBookingPanel
            authenticationHref={authenticationHref}
            bookingSubjects={[]}
            defaultLocalStartsAt={defaultVenueStart(inventory.venue.timezone)}
            inventory={inventory}
            isDunaPlus={false}
            suggestedPlayers={[]}
          />
          {layout && (
            <VenueLayoutViewer layout={layout} venueName={venue.name} />
          )}
        </main>
      ) : (
        <main className="standard-page public-venue-page public-venue-summary">
          <header
            className="public-venue-summary__hero"
            style={
              summary!.imageUrl
                ? {
                    backgroundImage: `linear-gradient(110deg, rgba(7, 27, 45, .94), rgba(7, 27, 45, .42)), url(${summary!.imageUrl})`,
                  }
                : undefined
            }
          >
            <span>PUBLIC COURT GUIDE</span>
            <h1>{summary!.name}</h1>
            <p>
              <MapPin aria-hidden size={17} /> {summary!.city},{" "}
              {summary!.region}
            </p>
          </header>
          <section className="public-venue-summary__body">
            <div className="public-venue-summary__facts">
              <article>
                <Waves aria-hidden size={22} />
                <strong>{summary!.courtCount}</strong>
                <span>public courts</span>
              </article>
              <article>
                <Clock3 aria-hidden size={22} />
                <strong>{summary!.openNow ? "Open now" : "Hours vary"}</strong>
                <span>{summary!.timezone}</span>
              </article>
              <article>
                <MapPin aria-hidden size={22} />
                <strong>{summary!.city}</strong>
                <span>{summary!.region}</span>
              </article>
            </div>
            {summary!.tags.length > 0 ? (
              <div className="public-venue-summary__tags">
                {summary!.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
            <div className="public-venue-summary__notice">
              <div>
                <span>BOOKING STATUS</span>
                <h2>Online rental details are coming soon.</h2>
                <p>
                  This venue is public on Duna, but it has not published live
                  court inventory yet. Keep exploring nearby play in the
                  meantime.
                </p>
              </div>
              <Link className="primary-action" href="/discover">
                Back to discover <ArrowRight aria-hidden size={17} />
              </Link>
            </div>
            {layout && (
              <VenueLayoutViewer layout={layout} venueName={venue.name} />
            )}
          </section>
        </main>
      )}
      <SiteFooter />
    </>
  );
}
