import type { EventLocation } from "@duna/core";

export function resolveCanonicalEventLocation(input: {
  readonly blueprint?: EventLocation;
  readonly venue?: {
    readonly name?: string | null;
    readonly address?: string;
    readonly googlePlaceId?: string | null;
    readonly latitude?: number | null;
    readonly longitude?: number | null;
  };
}): EventLocation | undefined {
  if (input.blueprint?.mode === "online") return input.blueprint;
  const venue = input.venue;
  const venueName =
    venue?.name?.trim() || input.blueprint?.venueName?.trim() || undefined;
  if (!venueName) return undefined;
  const venueAddress = venue?.address?.trim();
  const venuePlaceId = venue?.googlePlaceId?.trim();
  const venueHasCoordinates =
    venue?.latitude !== undefined &&
    venue.latitude !== null &&
    venue?.longitude !== undefined &&
    venue.longitude !== null;
  const venueHasCanonicalLocation = Boolean(
    venueAddress || venuePlaceId || venueHasCoordinates,
  );
  // Never combine a canonical venue address with coordinates copied from a
  // different blueprint location. If the venue has no coordinates, clients
  // can geocode its address without inheriting a stale pin.
  const latitude = venueHasCanonicalLocation
    ? venueHasCoordinates
      ? venue!.latitude!
      : undefined
    : input.blueprint?.latitude;
  const longitude = venueHasCanonicalLocation
    ? venueHasCoordinates
      ? venue!.longitude!
      : undefined
    : input.blueprint?.longitude;
  const googlePlaceId = venueHasCanonicalLocation
    ? venuePlaceId
    : input.blueprint?.googlePlaceId;
  const address = venueHasCanonicalLocation
    ? venueAddress
    : input.blueprint?.address;
  return {
    mode: venue?.name ? "venue" : (input.blueprint?.mode ?? "venue"),
    venueName,
    ...(address ? { address } : {}),
    ...(googlePlaceId ? { googlePlaceId } : {}),
    ...(latitude !== undefined && latitude !== null ? { latitude } : {}),
    ...(longitude !== undefined && longitude !== null ? { longitude } : {}),
    ...(input.blueprint?.onlineUrl
      ? { onlineUrl: input.blueprint.onlineUrl }
      : {}),
    ...(input.blueprint?.courtNames?.length
      ? { courtNames: input.blueprint.courtNames }
      : {}),
    confidence:
      googlePlaceId &&
      latitude !== undefined &&
      latitude !== null &&
      longitude !== undefined &&
      longitude !== null
        ? "confirmed"
        : "approximate",
  };
}
