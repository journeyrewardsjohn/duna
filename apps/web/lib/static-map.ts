export function publicMapboxToken(
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return [
    environment.MAPBOX_API_TOKEN_PUBLIC,
    environment.mapbox_api_token_public,
    environment.NEXT_PUBLIC_MAPBOX_API_TOKEN,
    environment.MAPBOX_API_TOKEN,
  ]
    .map((value) => value?.trim())
    .find((value) => value?.startsWith("pk."));
}

export function geocodedCoordinates(
  value: unknown,
): { readonly latitude: number; readonly longitude: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const features = (value as { readonly features?: unknown }).features;
  if (!Array.isArray(features)) return undefined;
  const coordinates = (
    features[0] as
      | {
          readonly geometry?: { readonly coordinates?: unknown };
          readonly properties?: {
            readonly coordinates?: {
              readonly latitude?: unknown;
              readonly longitude?: unknown;
            };
          };
        }
      | undefined
  )?.geometry?.coordinates;
  const propertyCoordinates = (
    features[0] as
      | {
          readonly properties?: {
            readonly coordinates?: {
              readonly latitude?: unknown;
              readonly longitude?: unknown;
            };
          };
        }
      | undefined
  )?.properties?.coordinates;
  const longitude = Array.isArray(coordinates)
    ? Number(coordinates[0])
    : Number(propertyCoordinates?.longitude);
  const latitude = Array.isArray(coordinates)
    ? Number(coordinates[1])
    : Number(propertyCoordinates?.latitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  return { latitude, longitude };
}

export function mapboxStaticImageUrl(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly token: string;
}): string {
  const point = `${input.longitude},${input.latitude}`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+0d6370(${point})/${point},15/960x540@2x?access_token=${encodeURIComponent(input.token)}`;
}
