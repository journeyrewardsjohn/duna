import type { PublicCoach, PublicOrganizationStorefront } from "@duna/api";
import { absolutePublicUrl } from "../../lib/pro-seo";
import { offeringAvailability, offeringPrice, type Offering } from "./offers";

/**
 * JSON-LD for a club and its offerings (website.md §2.12): one graph per
 * page with stable ids, the canonical URL, a breadcrumb and the Markdown
 * encoding. Only facts the page shows: no ratings, reviews or counts.
 */
export type JsonLd = { readonly [key: string]: unknown };

export function markdownEncoding(path: string): JsonLd {
  return {
    "@type": "MediaObject",
    encodingFormat: "text/markdown",
    contentUrl: absolutePublicUrl(`${path}.md`),
  };
}

export function breadcrumbs(
  pageUrl: string,
  trail: readonly { readonly name: string; readonly path: string }[],
): JsonLd {
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumbs`,
    itemListElement: [{ name: "Duna", path: "/" }, ...trail].map(
      (crumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
        item: absolutePublicUrl(crumb.path),
      }),
    ),
  };
}

export const clubId = (slug: string) =>
  `${absolutePublicUrl(`/clubs/${slug}`)}#club`;

type Storefront = PublicOrganizationStorefront;

function postalAddress(input: {
  readonly addressLine1?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
}): JsonLd | undefined {
  if (!input.addressLine1 && !input.locality) return undefined;
  return {
    "@type": "PostalAddress",
    ...(input.addressLine1 ? { streetAddress: input.addressLine1 } : {}),
    ...(input.locality ? { addressLocality: input.locality } : {}),
    ...(input.administrativeArea
      ? { addressRegion: input.administrativeArea }
      : {}),
    ...(input.postalCode ? { postalCode: input.postalCode } : {}),
    addressCountry: input.countryCode,
  };
}

function offer(item: Offering, url: string, now: Date): JsonLd | undefined {
  const price = offeringPrice(item);
  if (!price.card) return undefined;
  const availability = offeringAvailability(item, now).kind;
  return {
    "@type": "Offer",
    name: item.title,
    url,
    // The price a visitor pays, all-in (the page shows the same number).
    price: (price.card.allInMinor / 100).toFixed(2),
    priceCurrency: price.card.currency,
    availability:
      availability === "sold-out" || availability === "full"
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
  };
}

/** The club page: `SportsClub` with each venue as a `SportsActivityLocation`. */
export function clubJsonLd(input: {
  readonly storefront: Storefront;
  readonly coaches: readonly Pick<PublicCoach, "handle" | "displayName">[];
  readonly description?: string;
  readonly image?: string;
  readonly now: Date;
}): JsonLd {
  const { storefront } = input;
  const path = `/clubs/${storefront.slug}`;
  const url = absolutePublicUrl(path);
  const address = postalAddress(storefront.contact);
  const venues = storefront.venues.map((venue) => ({
    "@type": "SportsActivityLocation",
    "@id": `${url}#venue-${venue.id}`,
    name: venue.name,
    ...(postalAddress(venue) ? { address: postalAddress(venue) } : {}),
    ...(venue.latitude !== undefined && venue.longitude !== undefined
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: venue.latitude,
            longitude: venue.longitude,
          },
        }
      : {}),
    ...(venue.amenities.length
      ? {
          amenityFeature: venue.amenities.map((amenity) => ({
            "@type": "LocationFeatureSpecification",
            name: amenity,
            value: true,
          })),
        }
      : {}),
    containedInPlace: { "@id": clubId(storefront.slug) },
  }));
  const offers = storefront.catalog
    .filter((item) => item.visibility === "public")
    .flatMap((item) => {
      const made = offer(
        item,
        absolutePublicUrl(`${path}/products/${item.slug}`),
        input.now,
      );
      return made ? [made] : [];
    });
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: storefront.name,
        mainEntity: { "@id": clubId(storefront.slug) },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
        encoding: markdownEncoding(path),
      },
      breadcrumbs(url, [{ name: storefront.name, path }]),
      {
        "@type": "SportsClub",
        "@id": clubId(storefront.slug),
        identifier: storefront.organizationId,
        name: storefront.name,
        url,
        sport: "Volleyball",
        ...(input.description ? { description: input.description } : {}),
        ...(input.image ? { image: absolutePublicUrl(input.image) } : {}),
        ...(address ? { address } : {}),
        ...(storefront.contact.email
          ? { email: storefront.contact.email }
          : {}),
        ...(storefront.contact.phone
          ? { telephone: storefront.contact.phone }
          : {}),
        ...(venues.length
          ? { location: venues.map((venue) => ({ "@id": venue["@id"] })) }
          : {}),
        ...(input.coaches.length
          ? {
              employee: input.coaches.map((coach) => ({
                "@type": "Person",
                "@id": `${absolutePublicUrl(`/coaches/${coach.handle}`)}#person`,
                name: coach.displayName,
                url: absolutePublicUrl(`/coaches/${coach.handle}`),
              })),
            }
          : {}),
        ...(offers.length ? { makesOffer: offers } : {}),
      },
      ...venues,
    ],
  };
}

/** An offering page: `Product` (goods, memberships, packs) or `Service`, with its `Offer`s. */
export function offeringJsonLd(input: {
  readonly storefront: Pick<Storefront, "slug" | "name">;
  readonly item: Offering;
  readonly now: Date;
}): JsonLd {
  const { storefront, item } = input;
  const path = `/clubs/${storefront.slug}/products/${item.slug}`;
  const url = absolutePublicUrl(path);
  const availability = offeringAvailability(item, input.now).kind;
  const offers = item.variants.flatMap((variant) => {
    const price = offeringPrice(item, variant.id).card;
    if (!price) return [];
    const soldOut =
      variant.availableQuantity === 0 ||
      availability === "full" ||
      availability === "sold-out";
    return [
      {
        "@type": "Offer",
        name: variant.title,
        url,
        price: (price.allInMinor / 100).toFixed(2),
        priceCurrency: price.currency,
        availability: soldOut
          ? "https://schema.org/SoldOut"
          : "https://schema.org/InStock",
        ...(variant.sku ? { sku: variant.sku } : {}),
      },
    ];
  });
  const images = item.media
    .filter((media) => media.kind === "image")
    .map((media) => absolutePublicUrl(media.url));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: item.title,
        mainEntity: { "@id": `${url}#offering` },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
        encoding: markdownEncoding(path),
      },
      breadcrumbs(url, [
        { name: storefront.name, path: `/clubs/${storefront.slug}` },
        { name: item.title, path },
      ]),
      {
        "@type":
          item.type === "good" || item.type === "plan" ? "Product" : "Service",
        "@id": `${url}#offering`,
        identifier: item.id,
        name: item.title,
        url,
        ...(item.shortSummary || item.description
          ? { description: item.shortSummary ?? item.description }
          : {}),
        ...(images.length ? { image: images } : {}),
        ...(item.type === "good" || item.type === "plan"
          ? { brand: { "@id": clubId(storefront.slug) } }
          : { provider: { "@id": clubId(storefront.slug) } }),
        ...(offers.length ? { offers } : {}),
      },
      {
        "@type": "SportsClub",
        "@id": clubId(storefront.slug),
        name: storefront.name,
        url: absolutePublicUrl(`/clubs/${storefront.slug}`),
      },
    ],
  };
}

/** JSON-LD for a `<script>`: `<` escaped so it can never close the tag. */
export function serializeGraph(value: JsonLd): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
