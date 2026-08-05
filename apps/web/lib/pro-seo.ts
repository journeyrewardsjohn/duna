import type { PublicProEvent, PublicProMatchDetail } from "@duna/api";

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLdValue[]
  | { readonly [key: string]: JsonLdValue | undefined };

const productionOrigin = "https://duna.coach";

export function publicSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return productionOrigin;
  try {
    const url = new URL(configured);
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
    `${event.name} is a ${event.genderCategory.toLowerCase()} ${event.category ?? "professional beach volleyball"} event in ${event.location ?? "the Beach Pro Tour calendar"}. Follow teams, schedule, scores, standings, broadcasts, and SandRating context on Duna.`
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
      ...(player.handle
        ? { "@id": absolutePublicUrl(`/players/${player.handle}`) }
        : {}),
      name: player.name,
      url: player.handle
        ? absolutePublicUrl(`/players/${player.handle}`)
        : undefined,
      additionalProperty:
        player.rating !== undefined
          ? {
              "@type": "PropertyValue",
              name: "SandRating",
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
) {
  return options.map((option, index) => ({
    "@type": "BroadcastEvent",
    "@id": `${subjectId}#broadcast-${index + 1}`,
    name: option.channelName ?? option.label,
    isLiveBroadcast: true,
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
  const broadcastEntities = broadcasts(event.watchOptions, eventId);
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
        subEvent: event.matches.map((match) => ({
          "@type": "SportsEvent",
          "@id": absolutePublicUrl(match.canonicalPath),
          name: `${match.teamA.label} vs ${match.teamB.label}`,
          url: absolutePublicUrl(match.canonicalPath),
          startDate: match.playedAt,
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
  return `${match.teamA.label} vs ${match.teamB.label} at ${event.name}. View the schedule, live status, set scores, player SandRatings, prediction, and broadcast details.${result}`;
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
  const broadcastEntities = broadcasts(match.watchOptions, matchId);
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
        startDate: match.playedAt,
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
    ],
  };
}
