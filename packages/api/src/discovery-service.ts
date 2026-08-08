import {
  defaultEventMedia,
  type EventSummary,
  type VenueSummary,
} from "@duna/core";
import type { DiscoveryMap, DiscoveryMapItem, PublicCoach } from "./contracts";
import { loadPublicCoaches } from "./catalog-service";
import { getRepository } from "./repository";
import {
  loadPublicProCoverage,
  type PublicProCoverage,
} from "./sand-data/service";

type PublicProEvent = PublicProCoverage["events"][number];
type PublicProMatch = PublicProCoverage["matches"][number];

function finiteCoordinate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function venueCoordinates(
  venues: readonly VenueSummary[],
  organizationId?: string,
  venueName?: string,
): Pick<DiscoveryMapItem, "latitude" | "longitude"> {
  const normalizedName = venueName?.trim().toLowerCase();
  const venue =
    venues.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        normalizedName &&
        candidate.name.trim().toLowerCase() === normalizedName,
    ) ??
    venues.find((candidate) => candidate.organizationId === organizationId);
  return venue ? { latitude: venue.latitude, longitude: venue.longitude } : {};
}

function eventPoint(
  event: EventSummary,
  venues: readonly VenueSummary[],
): DiscoveryMapItem {
  const imageUrl =
    event.media?.find((item) => item.kind === "image")?.url ??
    event.imageUrl ??
    defaultEventMedia(event.kind, event.id).path;
  const directCoordinates =
    finiteCoordinate(event.location?.latitude) &&
    finiteCoordinate(event.location?.longitude)
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
        }
      : venueCoordinates(venues, event.organizationId, event.venueName);
  return {
    id: `event:${event.id}`,
    entityType: "event",
    kind: event.kind,
    title: event.title,
    subtitle: event.venueName || event.organizationName,
    href: `/events/${event.slug}`,
    ...directCoordinates,
    ...(event.organizationId ? { organizationId: event.organizationId } : {}),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    imageUrl,
    ...(event.live !== undefined ? { live: event.live } : {}),
    price: event.price,
    tags: [event.kind, event.organizationName, event.venueName, ...event.tags],
  };
}

function venuePoint(venue: VenueSummary): DiscoveryMapItem {
  return {
    id: `venue:${venue.id}`,
    entityType: "venue",
    kind: "court-booking",
    title: venue.name,
    subtitle: `${venue.city}, ${venue.region}`,
    href: `/app/venues/${venue.id}`,
    latitude: venue.latitude,
    longitude: venue.longitude,
    organizationId: venue.organizationId,
    ...(venue.imageUrl ? { imageUrl: venue.imageUrl } : {}),
    openNow: venue.openNow,
    courtCount: venue.courtCount,
    tags: ["venue", "courts", venue.city, venue.region, ...venue.tags],
  };
}

function coachPoint(
  coach: PublicCoach,
  venues: readonly VenueSummary[],
): DiscoveryMapItem {
  return {
    id: `coach:${coach.organizationId}:${coach.personId}`,
    entityType: "coach",
    kind: "coach",
    title: coach.displayName,
    subtitle: coach.homeMarket || coach.organizationName,
    href: `/coaches/${coach.handle}?organization=${coach.organizationSlug}`,
    ...venueCoordinates(venues, coach.organizationId),
    organizationId: coach.organizationId,
    ...(coach.avatarUrl ? { imageUrl: coach.avatarUrl } : {}),
    tags: [
      "coach",
      coach.handle,
      coach.organizationName,
      coach.homeMarket ?? "",
      ...coach.services.map((service) => service.title),
    ].filter(Boolean),
  };
}

function organizationPoints(
  events: readonly EventSummary[],
  venues: readonly VenueSummary[],
  coaches: readonly PublicCoach[],
): DiscoveryMapItem[] {
  const organizations = new Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      imageUrl?: string;
      latitude?: number;
      longitude?: number;
      markets: Set<string>;
      tags: Set<string>;
    }
  >();
  const ensure = (input: {
    id: string;
    slug: string;
    name: string;
    imageUrl?: string;
    latitude?: number;
    longitude?: number;
  }) => {
    const current = organizations.get(input.id) ?? {
      id: input.id,
      slug: input.slug,
      name: input.name,
      markets: new Set<string>(),
      tags: new Set<string>(["organization", "club"]),
    };
    if (!current.imageUrl && input.imageUrl) current.imageUrl = input.imageUrl;
    if (current.latitude === undefined && input.latitude !== undefined) {
      current.latitude = input.latitude;
    }
    if (current.longitude === undefined && input.longitude !== undefined) {
      current.longitude = input.longitude;
    }
    organizations.set(input.id, current);
    return current;
  };

  for (const event of events) {
    if (!event.organizationId || !event.organizationSlug) continue;
    const coordinates =
      finiteCoordinate(event.location?.latitude) &&
      finiteCoordinate(event.location?.longitude)
        ? {
            latitude: event.location.latitude,
            longitude: event.location.longitude,
          }
        : venueCoordinates(venues, event.organizationId, event.venueName);
    const organization = ensure({
      id: event.organizationId,
      slug: event.organizationSlug,
      name: event.organizationName,
      imageUrl:
        event.media?.find((item) => item.kind === "image")?.url ??
        event.imageUrl,
      ...coordinates,
    });
    organization.markets.add(event.venueName);
    organization.tags.add(event.title);
    organization.tags.add(event.kind);
  }
  for (const coach of coaches) {
    const coordinates = venueCoordinates(venues, coach.organizationId);
    const organization = ensure({
      id: coach.organizationId,
      slug: coach.organizationSlug,
      name: coach.organizationName,
      imageUrl: coach.avatarUrl,
      ...coordinates,
    });
    if (coach.homeMarket) organization.markets.add(coach.homeMarket);
    organization.tags.add(coach.displayName);
    for (const service of coach.services) organization.tags.add(service.title);
  }

  return [...organizations.values()].map((organization) => ({
    id: `organization:${organization.id}:${organization.slug}`,
    entityType: "organization",
    kind: "club",
    title: organization.name,
    subtitle:
      [...organization.markets].filter(Boolean).slice(0, 2).join(" · ") ||
      "Club, coaching, and events",
    href: `/clubs/${organization.slug}`,
    organizationId: organization.id,
    ...(organization.latitude !== undefined
      ? { latitude: organization.latitude }
      : {}),
    ...(organization.longitude !== undefined
      ? { longitude: organization.longitude }
      : {}),
    ...(organization.imageUrl ? { imageUrl: organization.imageUrl } : {}),
    tags: [...organization.tags, ...organization.markets, organization.slug],
  }));
}

function proEventPoint(event: PublicProEvent): DiscoveryMapItem {
  const latitude = event.venue?.latitude;
  const longitude = event.venue?.longitude;
  const coordinates =
    finiteCoordinate(latitude) && finiteCoordinate(longitude)
      ? { latitude, longitude }
      : {};
  const startsAt = event.startsOn
    ? new Date(`${event.startsOn}T12:00:00.000Z`).toISOString()
    : undefined;
  const endsAt = event.endsOn
    ? new Date(`${event.endsOn}T23:59:59.999Z`).toISOString()
    : undefined;
  return {
    id: `pro-tour:${event.id}`,
    entityType: "pro-tour",
    kind: event.tour,
    title: event.name,
    subtitle: event.venueName || event.location || event.tour,
    href: `/events/${event.slug}`,
    ...coordinates,
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    imageUrl:
      event.poster?.url ?? defaultEventMedia("tournament", event.id).path,
    ...(event.poster?.kind === "poster"
      ? { imageFit: "contain" as const }
      : {}),
    live: event.live,
    tags: [
      "pro tour",
      event.tour,
      event.source,
      event.category ?? "",
      event.genderCategory ?? "",
      event.location ?? "",
    ].filter(Boolean),
  };
}

function proMatchPoint(
  match: PublicProMatch,
  events: readonly PublicProEvent[],
): DiscoveryMapItem {
  const event = events.find(
    (candidate) => candidate.externalEventId === match.externalEventId,
  );
  const latitude = event?.venue?.latitude;
  const longitude = event?.venue?.longitude;
  const coordinates =
    finiteCoordinate(latitude) && finiteCoordinate(longitude)
      ? { latitude, longitude }
      : {};
  return {
    id: `match:${match.id}`,
    entityType: "match",
    kind: "match",
    title: `${match.teamA.label} vs ${match.teamB.label}`,
    subtitle: [match.roundLabel, event?.name ?? match.tour ?? match.source]
      .filter(Boolean)
      .join(" · "),
    href:
      match.canonicalPath ?? (event ? `/events/${event.slug}` : "/discover"),
    ...coordinates,
    ...(match.scheduledAt
      ? { startsAt: match.scheduledAt }
      : match.playedAt
        ? { startsAt: match.playedAt }
        : {}),
    ...(event?.poster?.url ? { imageUrl: event.poster.url } : {}),
    live: match.status === "live",
    tags: [
      "match",
      match.roundLabel ?? "",
      event?.name ?? "",
      event?.location ?? "",
      match.teamA.label,
      match.teamB.label,
      ...match.teamA.players.map((player) => player.name),
      ...match.teamB.players.map((player) => player.name),
    ].filter(Boolean),
  };
}

export function buildDiscoveryMap(input: {
  readonly events: readonly EventSummary[];
  readonly venues: readonly VenueSummary[];
  readonly coaches: readonly PublicCoach[];
  readonly proEvents?: readonly PublicProEvent[];
  readonly proMatches?: readonly PublicProMatch[];
  readonly now?: Date;
}): DiscoveryMap {
  const now = input.now ?? new Date();
  const isCurrent = (endsAt?: string) => {
    if (!endsAt) return true;
    const timestamp = Date.parse(endsAt);
    return Number.isNaN(timestamp) || timestamp >= now.getTime();
  };
  const items = [
    ...organizationPoints(input.events, input.venues, input.coaches),
    ...input.venues.map(venuePoint),
    ...input.events
      .filter((event) => isCurrent(event.endsAt))
      .map((event) => eventPoint(event, input.venues)),
    ...input.coaches.map((coach) => coachPoint(coach, input.venues)),
    ...(input.proEvents ?? [])
      .map(proEventPoint)
      .filter((event) => isCurrent(event.endsAt)),
    ...(input.proMatches ?? [])
      .filter((match) => {
        if (match.status === "live" || match.status === "scheduled")
          return true;
        const playedAt = match.playedAt ? Date.parse(match.playedAt) : NaN;
        return (
          !Number.isNaN(playedAt) && playedAt >= now.getTime() - 7 * 86_400_000
        );
      })
      .slice(0, 300)
      .map((match) => proMatchPoint(match, input.proEvents ?? [])),
  ];
  return {
    generatedAt: now.toISOString(),
    items,
  };
}

export async function loadDiscoveryMap(): Promise<DiscoveryMap> {
  const repository = getRepository();
  const [events, venues, coaches, proCoverage] = await Promise.all([
    repository.public.events(),
    repository.public.venues(),
    loadPublicCoaches().catch(() => []),
    loadPublicProCoverage().catch(() => undefined),
  ]);
  return buildDiscoveryMap({
    events,
    venues,
    coaches,
    proEvents: proCoverage?.events,
    proMatches: proCoverage?.matches,
  });
}
