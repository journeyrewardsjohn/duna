import type {
  CourtBookingInventory,
  DiscoveryMapItem,
  VenueSummary,
} from "@duna/api";
import { absolutePublicUrl } from "./pro-seo";

type JsonLd =
  | string
  | number
  | boolean
  | null
  | readonly JsonLd[]
  | { readonly [key: string]: JsonLd | undefined };

function markdownEncoding(path: string) {
  return {
    "@type": "MediaObject",
    encodingFormat: "text/markdown",
    contentUrl: absolutePublicUrl(`${path}.md`),
  };
}

function discoveryEntity(item: DiscoveryMapItem): JsonLd {
  const url = absolutePublicUrl(item.href);
  const location =
    item.latitude !== undefined && item.longitude !== undefined
      ? {
          "@type": "Place",
          name: item.subtitle,
          geo: {
            "@type": "GeoCoordinates",
            latitude: item.latitude,
            longitude: item.longitude,
          },
        }
      : item.subtitle
        ? { "@type": "Place", name: item.subtitle }
        : undefined;
  const shared = {
    "@id": `${url}#entity`,
    identifier: item.id,
    name: item.title,
    url,
    image: item.imageUrl,
  };
  if (item.entityType === "coach") {
    return {
      "@type": "Person",
      ...shared,
      jobTitle: "Beach volleyball coach",
      homeLocation: location,
    };
  }
  if (item.entityType === "organization") {
    return {
      "@type": "SportsOrganization",
      ...shared,
      sport: "Beach volleyball",
      location,
    };
  }
  if (item.entityType === "venue") {
    return {
      "@type": "SportsActivityLocation",
      ...shared,
      sport: "Beach volleyball",
      geo:
        item.latitude !== undefined && item.longitude !== undefined
          ? {
              "@type": "GeoCoordinates",
              latitude: item.latitude,
              longitude: item.longitude,
            }
          : undefined,
      address: item.subtitle,
      additionalProperty:
        item.courtCount !== undefined
          ? {
              "@type": "PropertyValue",
              name: "Court count",
              value: item.courtCount,
            }
          : undefined,
    };
  }
  return {
    "@type": "SportsEvent",
    ...shared,
    sport: "Beach volleyball",
    startDate: item.startsAt,
    endDate: item.endsAt,
    eventStatus: item.live
      ? "https://schema.org/EventInProgress"
      : "https://schema.org/EventScheduled",
    location,
    offers: item.price
      ? {
          "@type": "Offer",
          price: item.price.amountMinor / 100,
          priceCurrency: item.price.currency,
          availability:
            item.spotsRemaining === 0
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
          url,
        }
      : undefined,
  };
}

export function discoveryCollectionJsonLd(
  items: readonly DiscoveryMapItem[],
): JsonLd {
  const canonicalPath = "/discover";
  const pageUrl = absolutePublicUrl(canonicalPath);
  const visible = [
    ...new Map(items.map((item) => [item.href, item] as const)).values(),
  ].slice(0, 60);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#page`,
        url: pageUrl,
        name: "Discover beach volleyball on Duna",
        description:
          "Find public beach volleyball events, tournaments, leagues, training, matches, clubs, coaches, and court rentals.",
        mainEntity: { "@id": `${pageUrl}#results` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumbs` },
        encoding: markdownEncoding(canonicalPath),
        inLanguage: "en-US",
        isPartOf: { "@id": `${absolutePublicUrl("/")}#website` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Duna",
            item: absolutePublicUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Discover",
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${pageUrl}#results`,
        name: "Public beach volleyball discovery",
        numberOfItems: visible.length,
        itemListElement: visible.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absolutePublicUrl(item.href),
          item: { "@id": `${absolutePublicUrl(item.href)}#entity` },
        })),
      },
      ...visible.map(discoveryEntity),
    ],
  };
}

export function venueSummaryJsonLd(venue: VenueSummary): JsonLd {
  const canonicalPath = `/venues/${venue.id}`;
  const pageUrl = absolutePublicUrl(canonicalPath);
  const venueId = `${pageUrl}#venue`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#page`,
        url: pageUrl,
        name: `${venue.name} beach volleyball courts`,
        mainEntity: { "@id": venueId },
        breadcrumb: { "@id": `${pageUrl}#breadcrumbs` },
        encoding: markdownEncoding(canonicalPath),
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Duna",
            item: absolutePublicUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Discover",
            item: absolutePublicUrl("/discover"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: venue.name,
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "SportsActivityLocation",
        "@id": venueId,
        identifier: venue.id,
        name: venue.name,
        url: pageUrl,
        image: venue.imageUrl,
        sport: "Beach volleyball",
        address: {
          "@type": "PostalAddress",
          addressLocality: venue.city,
          addressRegion: venue.region,
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: venue.latitude,
          longitude: venue.longitude,
        },
        additionalProperty: {
          "@type": "PropertyValue",
          name: "Court count",
          value: venue.courtCount,
        },
      },
    ],
  };
}

export function venueJsonLd(inventory: CourtBookingInventory): JsonLd {
  const venue = inventory.venue;
  const canonicalPath = `/venues/${venue.id}`;
  const pageUrl = absolutePublicUrl(canonicalPath);
  const venueId = `${pageUrl}#venue`;
  const organizationId = `${pageUrl}#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#page`,
        url: pageUrl,
        name: `${venue.name} beach volleyball courts`,
        description: venue.description,
        mainEntity: { "@id": venueId },
        breadcrumb: { "@id": `${pageUrl}#breadcrumbs` },
        encoding: markdownEncoding(canonicalPath),
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Duna",
            item: absolutePublicUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Discover",
            item: absolutePublicUrl("/discover"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: venue.name,
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "SportsActivityLocation",
        "@id": venueId,
        identifier: venue.id,
        name: venue.name,
        description: venue.description,
        url: pageUrl,
        image: venue.heroImageUrl,
        sport: "Beach volleyball",
        address: {
          "@type": "PostalAddress",
          addressLocality: venue.city,
          addressRegion: venue.region,
        },
        geo:
          venue.latitude !== undefined && venue.longitude !== undefined
            ? {
                "@type": "GeoCoordinates",
                latitude: venue.latitude,
                longitude: venue.longitude,
              }
            : undefined,
        amenityFeature: venue.amenities.map((amenity) => ({
          "@type": "LocationFeatureSpecification",
          name: amenity,
          value: true,
        })),
        containedInPlace: {
          "@type": "Place",
          name: `${venue.city}, ${venue.region}`,
        },
        provider: { "@id": organizationId },
        makesOffer: inventory.courts.flatMap((court) =>
          court.pricing
            ? [
                {
                  "@type": "Offer",
                  name: `${court.name} rental`,
                  price: court.pricing.baseAmountMinor / 100,
                  priceCurrency: court.pricing.currency,
                  url: pageUrl,
                  itemOffered: {
                    "@type": "Service",
                    name: `${court.name} beach volleyball court rental`,
                    provider: { "@id": organizationId },
                  },
                },
              ]
            : [],
        ),
      },
      {
        "@type": "SportsOrganization",
        "@id": organizationId,
        name: venue.organizationName,
        sport: "Beach volleyball",
      },
    ],
  };
}
