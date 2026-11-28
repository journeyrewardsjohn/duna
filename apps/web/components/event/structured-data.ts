import type { EventSummary } from "@duna/api";
import { absolutePublicUrl } from "../../lib/pro-seo";
import {
  breadcrumbs,
  clubId,
  markdownEncoding,
  type JsonLd,
} from "../club/structured-data";
import { divisionRows, eventPhase, lowestEntry } from "./event-model";

const STATUS = {
  cancelled: "https://schema.org/EventCancelled",
  live: "https://schema.org/EventScheduled",
  final: "https://schema.org/EventScheduled",
  open: "https://schema.org/EventScheduled",
  waitlist: "https://schema.org/EventScheduled",
} as const;

/**
 * `SportsEvent` for a public event page. Offers carry the all-in prices the
 * page shows; the organiser is the club's `SportsClub` id. No attendees or
 * performers: the page never names who is playing.
 */
export function eventJsonLd(event: EventSummary): JsonLd {
  const path = `/events/${event.slug}`;
  const url = absolutePublicUrl(path);
  const phase = eventPhase(event);
  const location = event.location;
  const organizerId = event.organizationSlug
    ? clubId(event.organizationSlug)
    : `${url}#organizer`;
  const divisions = divisionRows(event);
  const offers = divisions.length
    ? divisions.flatMap((division) =>
        division.playerPrice
          ? [
              {
                "@type": "Offer",
                name: `${division.name} entry`,
                url: `${url}#divisions`,
                price: (division.playerPrice.allInMinor / 100).toFixed(2),
                priceCurrency: division.playerPrice.currency,
                availability: division.full
                  ? "https://schema.org/SoldOut"
                  : "https://schema.org/InStock",
              },
            ]
          : [],
      )
    : [
        {
          "@type": "Offer",
          name: `${event.title} entry`,
          url,
          price: (lowestEntry(event).price.allInMinor / 100).toFixed(2),
          priceCurrency: lowestEntry(event).price.currency,
          availability:
            event.spotsRemaining > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/SoldOut",
        },
      ];
  const images = [
    ...(event.media ?? [])
      .filter((media) => media.kind === "image")
      .map((media) => absolutePublicUrl(media.url)),
    ...(event.imageUrl ? [absolutePublicUrl(event.imageUrl)] : []),
  ];
  const place =
    location?.mode === "online"
      ? {
          "@type": "VirtualLocation",
          "@id": `${url}#place`,
          url: location.onlineUrl ?? url,
        }
      : {
          "@type": "SportsActivityLocation",
          "@id": `${url}#place`,
          name: location?.venueName ?? event.venueName,
          ...(location?.address
            ? {
                address: {
                  "@type": "PostalAddress",
                  streetAddress: location.address,
                },
              }
            : {}),
          ...(location?.latitude !== undefined &&
          location.longitude !== undefined
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: location.latitude,
                  longitude: location.longitude,
                },
              }
            : {}),
        };
  const organizerName = event.organizationName.replace(/^Hosted by\s+/i, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: event.title,
        mainEntity: { "@id": `${url}#event` },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
        encoding: markdownEncoding(path),
      },
      breadcrumbs(url, [
        ...(event.organizationSlug
          ? [{ name: organizerName, path: `/clubs/${event.organizationSlug}` }]
          : []),
        { name: event.title, path },
      ]),
      {
        "@type": "SportsEvent",
        "@id": `${url}#event`,
        identifier: event.id,
        name: event.title,
        url,
        ...(event.shortSummary || event.description
          ? { description: event.shortSummary ?? event.description }
          : {}),
        ...(images.length ? { image: images } : {}),
        startDate: event.startsAt,
        endDate: event.endsAt,
        eventStatus: STATUS[phase],
        eventAttendanceMode:
          location?.mode === "online"
            ? "https://schema.org/OnlineEventAttendanceMode"
            : "https://schema.org/OfflineEventAttendanceMode",
        location: { "@id": `${url}#place` },
        organizer: { "@id": organizerId },
        sport: "Volleyball",
        offers,
      },
      place,
      {
        "@type": "SportsClub",
        "@id": organizerId,
        name: organizerName,
        ...(event.organizationSlug
          ? { url: absolutePublicUrl(`/clubs/${event.organizationSlug}`) }
          : {}),
      },
    ],
  };
}
