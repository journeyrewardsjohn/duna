export type NativeMapPlatform = "ios" | "android" | "web";

type MapCoordinates = {
  readonly latitude?: number;
  readonly longitude?: number;
};

type GoogleMapsSearchInput = {
  readonly address: string;
  readonly googlePlaceId?: string;
};

type NativeMapLinkInput = MapCoordinates & {
  readonly address: string;
  readonly label?: string;
  readonly platform: NativeMapPlatform;
};

function validCoordinates(
  coordinates: MapCoordinates,
): coordinates is Required<MapCoordinates> {
  return (
    coordinates.latitude !== undefined &&
    coordinates.longitude !== undefined &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

export function googleMapsSearchUrl({
  address,
  googlePlaceId,
}: GoogleMapsSearchInput): string {
  const trimmedAddress = address.trim();
  const placeId = googlePlaceId?.trim();
  const query = `api=1&query=${encodeURIComponent(trimmedAddress)}`;
  return placeId
    ? `https://www.google.com/maps/search/?${query}&query_place_id=${encodeURIComponent(placeId)}`
    : `https://www.google.com/maps/search/?${query}`;
}

export function nativeMapUrl({
  address,
  label,
  latitude,
  longitude,
  platform,
}: NativeMapLinkInput): string {
  const trimmedAddress = address.trim();
  const locationLabel = label?.trim() || trimmedAddress;
  const coordinates = { latitude, longitude };

  if (platform === "ios") {
    const query = `q=${encodeURIComponent(locationLabel)}`;
    return validCoordinates(coordinates)
      ? `https://maps.apple.com/?${query}&ll=${coordinates.latitude},${coordinates.longitude}`
      : `https://maps.apple.com/?${query}`;
  }

  if (platform === "android") {
    const origin = validCoordinates(coordinates)
      ? `${coordinates.latitude},${coordinates.longitude}`
      : "0,0";
    const query = validCoordinates(coordinates)
      ? `${coordinates.latitude},${coordinates.longitude}(${locationLabel})`
      : trimmedAddress;
    return `geo:${origin}?q=${encodeURIComponent(query)}`;
  }

  return googleMapsSearchUrl({ address: trimmedAddress });
}
