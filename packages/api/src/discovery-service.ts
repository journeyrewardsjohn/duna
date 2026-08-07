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

export function buildDiscoveryMap(input: {
  readonly events: readonly EventSummary[];
  readonly venues: readonly VenueSummary[];
  readonly coaches: readonly PublicCoach[];
  readonly proEvents?: readonly PublicProEvent[];
  readonly now?: Date;
}): DiscoveryMap {
  const now = input.now ?? new Date();
  const isCurrent = (endsAt?: string) => {
    if (!endsAt) return true;
    const timestamp = Date.parse(endsAt);
    return Number.isNaN(timestamp) || timestamp >= now.getTime();
  };
  const items = [
    ...input.venues.map(venuePoint),
    ...input.events
      .filter((event) => isCurrent(event.endsAt))
      .map((event) => eventPoint(event, input.venues)),
    ...input.coaches.map((coach) => coachPoint(coach, input.venues)),
    ...(input.proEvents ?? [])
      .map(proEventPoint)
      .filter((event) => isCurrent(event.endsAt)),
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
  });
}
