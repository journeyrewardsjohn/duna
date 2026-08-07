import type {
  EventSummary,
  MatchSummary,
  PublicProfessionalTeam,
  PublicProEvent,
  PublicProMatchDetail,
} from "@duna/api";

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue | undefined };

const productionOrigin = "https://duna.coach";
const internalDeploymentHosts = new Set(["duna-web.vercel.app"]);

export function publicSiteOrigin(): string {
  const configured = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_DUNA_WEB_URL
  )?.trim();
  if (!configured) {
    return process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : productionOrigin;
  }
  try {
    const url = new URL(configured);
    if (
      internalDeploymentHosts.has(url.hostname) ||
      url.hostname.endsWith(".vercel.app")
    ) {
      return productionOrigin;
    }
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : productionOrigin;
  } catch {
    return productionOrigin;
  }
}

export function absolutePublicUrl(path: string): string {
  return new URL(path, `${publicSiteOrigin()}/`).toString();
}

export function professionalOgImageUrl(input: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly detail?: string;
}): string {
  const parameters = new URLSearchParams({ title: input.title.slice(0, 120) });
  if (input.eyebrow) parameters.set("eyebrow", input.eyebrow.slice(0, 80));
  if (input.detail) parameters.set("detail", input.detail.slice(0, 140));
  return absolutePublicUrl(`/api/og/pro?${parameters.toString()}`);
}

export function serializeJsonLd(value: JsonLdValue): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function professionalEventDescription(event: PublicProEvent): string {
  return (
    event.editorial.summary ??
    `${event.name} is a ${event.genderCategory.toLowerCase()} ${event.category ?? "professional beach volleyball"} event in ${event.location ?? "the Beach Pro Tour calendar"}. Follow teams, schedule, scores, standings, broadcasts, and Sand Rating context on Duna.`
  );
}

export function professionalEventImages(
  event: PublicProEvent,
): readonly { readonly url: string; readonly alt: string }[] {
  return event.editorial.media.flatMap((media) => {
    if (media.kind !== "hero-video")
      return [{ url: media.url, alt: media.alt }];
    return media.posterUrl ? [{ url: media.posterUrl, alt: media.alt }] : [];
  });
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/(^-|-$)/g, "") || "team"
  );
}

function statusUrl(status: "scheduled" | "live" | "completed") {
  return status === "live"
    ? "https://schema.org/EventInProgress"
    : status === "completed"
      ? "https://schema.org/EventCompleted"
      : "https://schema.org/EventScheduled";
}

function markdownEncoding(canonicalPath: string) {
  const pathname = canonicalPath.replace(/\/$/, "") || "/";
  const markdownPath = pathname === "/" ? "/index.md" : `${pathname}.md`;
  return {
    "@type": "MediaObject",
    encodingFormat: "text/markdown",
    contentUrl: absolutePublicUrl(markdownPath),
  };
}

function dunaOrganization() {
  return {
    "@type": "Organization",
    "@id": `${absolutePublicUrl("/")}#organization`,
    name: "Duna",
    url: absolutePublicUrl("/"),
    description:
      "The player network and operating system for beach volleyball.",
  };
}

function personEntity(player: {
  readonly id?: string;
  readonly personId?: string;
  readonly displayName?: string;
  readonly name?: string;
  readonly publicPath?: string;
  readonly handle?: string;
}) {
  const path =
    player.publicPath ??
    (player.handle ? `/players/${player.handle}` : undefined);
  return {
    "@type": "Person",
    ...(path
      ? { "@id": absolutePublicUrl(path), url: absolutePublicUrl(path) }
      : {}),
    identifier: player.personId ?? player.id,
    name: player.displayName ?? player.name,
  };
}

export function consumerEventJsonLd(event: EventSummary): JsonLdValue {
  const canonicalPath = `/events/${event.slug}`;
  const eventUrl = absolutePublicUrl(canonicalPath);
  const eventId = `${eventUrl}#event`;
  const location = event.location;
  const organizerId = event.organizationSlug
    ? `${absolutePublicUrl(`/clubs/${event.organizationSlug}`)}#organization`
    : `${eventUrl}#organizer`;
  const organizerEntity = {
    "@type": "SportsOrganization",
    "@id": organizerId,
    name: event.organizationName.replace(/^Hosted by\s+/i, ""),
    ...(event.organizationSlug
      ? { url: absolutePublicUrl(`/clubs/${event.organizationSlug}`) }
      : {}),
    sport: "Beach volleyball",
  };
  const locationEntity =
    location?.mode === "online"
      ? {
          "@type": "VirtualLocation",
          "@id": `${eventUrl}#venue`,
          url: location.onlineUrl ?? eventUrl,
        }
      : {
          "@type": "Place",
          "@id": `${eventUrl}#venue`,
          name: location?.venueName ?? event.venueName,
          address: location?.address
            ? {
                "@type": "PostalAddress",
                streetAddress: location.address,
              }
            : undefined,
          geo:
            location?.latitude !== undefined && location.longitude !== undefined
              ? {
                  "@type": "GeoCoordinates",
                  latitude: location.latitude,
                  longitude: location.longitude,
                }
              : undefined,
          hasMap: location?.googlePlaceId
            ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(location.googlePlaceId)}`
            : undefined,
        };
  const offers = [
    ...(event.divisions ?? []).map((division) => ({
      "@type": "Offer",
      name: `${division.name} registration`,
      price: division.price.amountMinor / 100,
      priceCurrency: division.price.currency,
      availability:
        division.spotsRemaining > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
      url: `${eventUrl}#divisions`,
    })),
    ...(event.tickets ?? [])
      .filter((ticket) => ticket.availableOnline)
      .map((ticket) => ({
        "@type": "Offer",
        name: ticket.name,
        price: ticket.price.amountMinor / 100,
        priceCurrency: ticket.price.currency,
        availability:
          ticket.remaining === 0
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
        url: `${eventUrl}#tickets`,
      })),
  ];
  if (offers.length === 0) {
    offers.push({
      "@type": "Offer",
      name: `${event.title} registration`,
      price: event.price.amountMinor / 100,
      priceCurrency: event.price.currency,
      availability:
        event.spotsRemaining > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
      url: eventUrl,
    });
  }
  const images = [
    ...(event.media ?? [])
      .filter((media) => media.kind === "image")
      .map((media) => media.url),
    ...(event.imageUrl ? [event.imageUrl] : []),
  ];
  const status =
    event.lifecycleStatus === "cancelled"
      ? "https://schema.org/EventCancelled"
      : event.lifecycleStatus === "completed"
        ? "https://schema.org/EventCompleted"
        : event.live
          ? "https://schema.org/EventInProgress"
          : "https://schema.org/EventScheduled";
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${eventUrl}#webpage`,
        url: eventUrl,
        name: event.title,
        description: event.shortSummary ?? event.description,
        mainEntity: { "@id": eventId },
        breadcrumb: { "@id": `${eventUrl}#breadcrumbs` },
        encoding: markdownEncoding(canonicalPath),
        publisher: { "@id": dunaOrganization()["@id"] },
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${eventUrl}#breadcrumbs`,
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
            name: event.title,
            item: eventUrl,
          },
        ],
      },
      {
        "@type": "SportsEvent",
        "@id": eventId,
        identifier: event.id,
        name: event.title,
        description: event.shortSummary ?? event.description,
        url: eventUrl,
        image: images.length ? images : undefined,
        startDate: event.startsAt,
        endDate: event.endsAt,
        eventStatus: status,
        eventAttendanceMode:
          location?.mode === "online"
            ? "https://schema.org/OnlineEventAttendanceMode"
            : "https://schema.org/OfflineEventAttendanceMode",
        location: { "@id": `${eventUrl}#venue` },
        organizer: { "@id": organizerId },
        offers,
        sport: "Beach volleyball",
        attendee: event.attendees?.map(personEntity),
        performer: event.host ? [personEntity(event.host)] : undefined,
        isAccessibleForFree: offers.every(
          (offer) => typeof offer.price === "number" && offer.price === 0,
        ),
      },
      organizerEntity,
      locationEntity,
      dunaOrganization(),
    ],
  };
}

export function matchJsonLd(
  match: MatchSummary,
  publicSourceUrl = match.sourceUrl,
): JsonLdValue {
  const canonicalPath = `/matches/${match.id}`;
  const matchUrl = absolutePublicUrl(canonicalPath);
  const eventUrl = match.eventSlug
    ? absolutePublicUrl(`/events/${match.eventSlug}`)
    : undefined;
  const team = (side: "A" | "B") => {
    const players = side === "A" ? match.teamA : match.teamB;
    return {
      "@type": "SportsTeam",
      "@id": `${matchUrl}#team-${side.toLowerCase()}`,
      name: players.map((player) => player.displayName).join(" / "),
      sport: "Beach volleyball",
      member: players.map(personEntity),
    };
  };
  const teamA = team("A");
  const teamB = team("B");
  const place = {
    "@type": "Place",
    "@id": `${matchUrl}#venue`,
    name: match.location?.name ?? match.venueName,
    address: match.location?.address
      ? {
          "@type": "PostalAddress",
          streetAddress: match.location.address,
        }
      : undefined,
    geo:
      match.location?.latitude !== undefined &&
      match.location.longitude !== undefined
        ? {
            "@type": "GeoCoordinates",
            latitude: match.location.latitude,
            longitude: match.location.longitude,
          }
        : undefined,
  };
  const teamAName = match.teamA.map((player) => player.displayName).join(" / ");
  const teamBName = match.teamB.map((player) => player.displayName).join(" / ");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${matchUrl}#webpage`,
        url: matchUrl,
        name: `${teamAName} vs ${teamBName}`,
        mainEntity: { "@id": `${matchUrl}#match` },
        encoding: markdownEncoding(canonicalPath),
        publisher: { "@id": dunaOrganization()["@id"] },
        inLanguage: "en-US",
      },
      {
        "@type": "SportsEvent",
        "@id": `${matchUrl}#match`,
        identifier: match.id,
        name: `${teamAName} vs ${teamBName}`,
        url: matchUrl,
        sameAs: publicSourceUrl,
        startDate: match.playedAt,
        eventStatus: "https://schema.org/EventCompleted",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        sport: "Beach volleyball",
        location: { "@id": place["@id"] },
        homeTeam: { "@id": teamA["@id"] },
        awayTeam: { "@id": teamB["@id"] },
        competitor: [{ "@id": teamA["@id"] }, { "@id": teamB["@id"] }],
        performer: [{ "@id": teamA["@id"] }, { "@id": teamB["@id"] }],
        superEvent: eventUrl
          ? {
              "@type": "SportsEvent",
              "@id": `${eventUrl}#event`,
              name: match.eventName,
              url: eventUrl,
            }
          : undefined,
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "Set scores",
            value: match.score.map(([a, b]) => `${a}-${b}`).join(", "),
          },
          {
            "@type": "PropertyValue",
            name: "Winner",
            value: match.winner === "A" ? teamAName : teamBName,
          },
          {
            "@type": "PropertyValue",
            name: "Verification",
            value: match.verification,
          },
        ],
      },
      place,
      teamA,
      teamB,
      dunaOrganization(),
    ],
  };
}

export function professionalTeamJsonLd(
  team: PublicProfessionalTeam,
): JsonLdValue {
  const canonicalPath = `/pro/teams/${team.teamNo}`;
  const teamUrl = absolutePublicUrl(canonicalPath);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${teamUrl}#webpage`,
        url: teamUrl,
        name: team.name,
        mainEntity: { "@id": `${teamUrl}#team` },
        encoding: markdownEncoding(canonicalPath),
        publisher: { "@id": dunaOrganization()["@id"] },
        inLanguage: "en-US",
      },
      {
        "@type": "SportsTeam",
        "@id": `${teamUrl}#team`,
        identifier: team.teamNo,
        name: team.name,
        url: teamUrl,
        sport: "Beach volleyball",
        member: team.players.map(personEntity),
        location: team.countryCode
          ? { "@type": "Country", name: team.countryCode }
          : undefined,
        additionalProperty: [
          { "@type": "PropertyValue", name: "Wins", value: team.record.wins },
          {
            "@type": "PropertyValue",
            name: "Losses",
            value: team.record.losses,
          },
          {
            "@type": "PropertyValue",
            name: "Verified matches",
            value: team.record.matches,
          },
        ],
      },
      dunaOrganization(),
    ],
  };
}

function organizer(event: PublicProEvent) {
  return event.source === "avp"
    ? {
        "@type": "SportsOrganization",
        "@id": "https://avp.com/#organization",
        name: "Association of Volleyball Professionals",
        alternateName: "AVP",
        url: "https://avp.com/",
        sport: "Beach volleyball",
      }
    : {
        "@type": "SportsOrganization",
        "@id": "https://en.volleyballworld.com/#organization",
        name: "Volleyball World Beach Pro Tour",
        alternateName: "Beach Pro Tour",
        url: "https://en.volleyballworld.com/beachvolleyball/competitions/beach-pro-tour/",
        sport: "Beach volleyball",
      };
}

function postalAddress(event: PublicProEvent) {
  const venue = event.editorial.venue;
  if (!venue) {
    return event.editorial.venueAddress
      ? {
          "@type": "PostalAddress",
          streetAddress: event.editorial.venueAddress,
        }
      : undefined;
  }
  return {
    "@type": "PostalAddress",
    streetAddress: venue.addressLine1 ?? venue.formattedAddress,
    addressLocality: venue.locality,
    addressRegion: venue.administrativeArea,
    postalCode: venue.postalCode,
    addressCountry: venue.countryCode,
  };
}

function placeEntity(event: PublicProEvent, eventUrl: string) {
  const venue = event.editorial.venue;
  const address = postalAddress(event);
  if (!event.editorial.venueName && !event.location && !address)
    return undefined;
  return {
    "@type": "Place",
    "@id": `${eventUrl}#venue`,
    name: event.editorial.venueName ?? event.location,
    address,
    geo:
      venue?.latitude !== undefined && venue.longitude !== undefined
        ? {
            "@type": "GeoCoordinates",
            latitude: venue.latitude,
            longitude: venue.longitude,
          }
        : undefined,
    hasMap: venue?.googleMapsUri,
  };
}

type TeamLike = PublicProEvent["matches"][number]["teamA"];

function teamKey(team: TeamLike): string {
  return team.players
    .map((player) => player.personId ?? player.name.toLowerCase())
    .sort()
    .join("|");
}

function teamEntity(team: TeamLike, eventUrl: string, idSuffix?: string) {
  const key = idSuffix ?? teamKey(team);
  return {
    "@type": "SportsTeam",
    "@id": `${eventUrl}#team-${slug(key)}`,
    name: team.label,
    sport: "Beach volleyball",
    member: team.players.map((player) => ({
      "@type": "Person",
      ...((player.publicPath ?? player.handle)
        ? {
            "@id": absolutePublicUrl(
              player.publicPath ?? `/players/${player.handle}`,
            ),
          }
        : {}),
      name: player.name,
      url:
        (player.publicPath ?? player.handle)
          ? absolutePublicUrl(player.publicPath ?? `/players/${player.handle}`)
          : undefined,
      additionalProperty:
        player.rating !== undefined
          ? {
              "@type": "PropertyValue",
              name: "Sand Rating",
              value: player.rating,
            }
          : undefined,
    })),
  };
}

function eventTeamEntities(event: PublicProEvent, eventUrl: string) {
  const teams = new Map<string, TeamLike>();
  for (const match of event.matches) {
    teams.set(teamKey(match.teamA), match.teamA);
    teams.set(teamKey(match.teamB), match.teamB);
  }
  for (const entry of event.teamEntries) {
    const team: TeamLike = {
      key: entry.externalTeamId,
      label: entry.label,
      players: entry.players.map((player) => ({
        name: player.name,
        ...(player.personId ? { personId: player.personId } : {}),
        ...(player.handle ? { handle: player.handle } : {}),
        ...(player.publicPath ? { publicPath: player.publicPath } : {}),
        ...(player.avatarUrl ? { avatarUrl: player.avatarUrl } : {}),
        ...(player.rating !== undefined ? { rating: player.rating } : {}),
      })),
    };
    teams.set(teamKey(team), team);
  }
  return [...teams.values()].map((team) => teamEntity(team, eventUrl));
}

function broadcasts(
  options: PublicProEvent["watchOptions"],
  subjectId: string,
  isLiveBroadcast: boolean,
) {
  return options.map((option, index) => ({
    "@type": "BroadcastEvent",
    "@id": `${subjectId}#broadcast-${index + 1}`,
    name: option.channelName ?? option.label,
    isLiveBroadcast,
    url: option.url,
    broadcastOfEvent: { "@id": subjectId },
    publishedOn: {
      "@type": "BroadcastService",
      name: option.channelName ?? option.label,
      url: option.url,
    },
  }));
}

export function professionalEventJsonLd(event: PublicProEvent): JsonLdValue {
  const eventUrl = absolutePublicUrl(`/events/${event.slug}`);
  const eventId = `${eventUrl}#event`;
  const images = professionalEventImages(event).map((image) => image.url);
  const teams = eventTeamEntities(event, eventUrl);
  const place = placeEntity(event, eventUrl);
  const broadcastEntities = broadcasts(event.watchOptions, eventId, event.live);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${eventUrl}#webpage`,
        url: eventUrl,
        name: event.name,
        description: professionalEventDescription(event),
        mainEntity: { "@id": eventId },
        breadcrumb: { "@id": `${eventUrl}#breadcrumbs` },
        encoding: markdownEncoding(`/events/${event.slug}`),
        publisher: { "@id": dunaOrganization()["@id"] },
        primaryImageOfPage: images[0]
          ? { "@type": "ImageObject", url: images[0] }
          : undefined,
        dateModified: event.lastSyncedAt,
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${eventUrl}#breadcrumbs`,
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
            name: "Pro beach volleyball",
            item: absolutePublicUrl("/pro"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: event.name,
            item: eventUrl,
          },
        ],
      },
      {
        "@type": "SportsEvent",
        "@id": eventId,
        identifier: event.externalEventId,
        name: event.name,
        url: eventUrl,
        sameAs: event.sourceUrl,
        description: professionalEventDescription(event),
        image: images.length > 0 ? images : undefined,
        startDate: event.startsOn,
        endDate: event.endsOn,
        eventStatus: statusUrl(
          event.live
            ? "live"
            : event.status === "completed"
              ? "completed"
              : "scheduled",
        ),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: place ? { "@id": `${eventUrl}#venue` } : undefined,
        organizer: { "@id": organizer(event)["@id"] },
        offers: event.editorial.ticketUrl
          ? {
              "@type": "Offer",
              url: event.editorial.ticketUrl,
            }
          : undefined,
        sport: "Beach volleyball",
        competitor: teams.map((team) => ({ "@id": team["@id"] })),
        performer: teams.map((team) => ({ "@id": team["@id"] })),
        subEvent: event.matches.map((match) => ({
          "@type": "SportsEvent",
          "@id": `${absolutePublicUrl(match.canonicalPath)}#match`,
          name: `${match.teamA.label} vs ${match.teamB.label}`,
          url: absolutePublicUrl(match.canonicalPath),
          startDate: match.scheduledAt ?? match.playedAt,
          eventStatus: statusUrl(match.status),
        })),
        subjectOf:
          broadcastEntities.length > 0
            ? broadcastEntities.map((broadcast) => ({
                "@id": broadcast["@id"],
              }))
            : undefined,
      },
      organizer(event),
      ...(place ? [place] : []),
      ...teams,
      ...broadcastEntities,
      dunaOrganization(),
    ],
  };
}

export function professionalMatchDescription(
  detail: PublicProMatchDetail,
): string {
  const { event, match } = detail;
  const result = match.sets.length
    ? ` Set scores: ${match.sets.map((set) => `${set.a}-${set.b}`).join(", ")}.`
    : "";
  return `${match.teamA.label} vs ${match.teamB.label} at ${event.name}. View the schedule, live status, set scores, player Sand Ratings, prediction, and broadcast details.${result}`;
}

export function professionalMatchJsonLd(
  detail: PublicProMatchDetail,
): JsonLdValue {
  const { event, match } = detail;
  const matchUrl = absolutePublicUrl(match.canonicalPath);
  const eventUrl = absolutePublicUrl(`/events/${event.slug}`);
  const matchId = `${matchUrl}#match`;
  const teamA = teamEntity(match.teamA, matchUrl, "team-a");
  const teamB = teamEntity(match.teamB, matchUrl, "team-b");
  const place = placeEntity(event, matchUrl);
  const broadcastEntities = broadcasts(
    match.watchOptions,
    matchId,
    match.status === "live",
  );
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${matchUrl}#webpage`,
        url: matchUrl,
        name: `${match.teamA.label} vs ${match.teamB.label}`,
        description: professionalMatchDescription(detail),
        mainEntity: { "@id": matchId },
        breadcrumb: { "@id": `${matchUrl}#breadcrumbs` },
        encoding: markdownEncoding(match.canonicalPath),
        publisher: { "@id": dunaOrganization()["@id"] },
        inLanguage: "en-US",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${matchUrl}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Pro beach volleyball",
            item: absolutePublicUrl("/pro"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: event.name,
            item: eventUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: `${match.teamA.label} vs ${match.teamB.label}`,
            item: matchUrl,
          },
        ],
      },
      {
        "@type": "SportsEvent",
        "@id": matchId,
        identifier: match.externalMatchId,
        name: `${match.teamA.label} vs ${match.teamB.label}`,
        url: matchUrl,
        sameAs: match.sourceUrl,
        description: professionalMatchDescription(detail),
        startDate: match.scheduledAt ?? match.playedAt,
        eventStatus: statusUrl(match.status),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        superEvent: {
          "@id": `${eventUrl}#event`,
          name: event.name,
          url: eventUrl,
        },
        location: place ? { "@id": `${matchUrl}#venue` } : undefined,
        organizer: { "@id": organizer(event)["@id"] },
        sport: "Beach volleyball",
        homeTeam: { "@id": teamA["@id"] },
        awayTeam: { "@id": teamB["@id"] },
        competitor: [{ "@id": teamA["@id"] }, { "@id": teamB["@id"] }],
        performer: [{ "@id": teamA["@id"] }, { "@id": teamB["@id"] }],
        subjectOf:
          broadcastEntities.length > 0
            ? broadcastEntities.map((broadcast) => ({
                "@id": broadcast["@id"],
              }))
            : undefined,
        additionalProperty:
          match.sets.length > 0
            ? {
                "@type": "PropertyValue",
                name: "Set scores",
                value: match.sets.map((set) => `${set.a}-${set.b}`).join(", "),
              }
            : undefined,
      },
      organizer(event),
      ...(place ? [place] : []),
      teamA,
      teamB,
      ...broadcastEntities,
      dunaOrganization(),
    ],
  };
}
