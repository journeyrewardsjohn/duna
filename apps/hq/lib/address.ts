export interface AddressValue {
  readonly googlePlaceId?: string;
  readonly googleMapsUri?: string;
  readonly formattedAddress?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function normalizeAddress(value: AddressValue): AddressValue {
  return {
    googlePlaceId: clean(value.googlePlaceId),
    googleMapsUri: clean(value.googleMapsUri),
    formattedAddress: clean(value.formattedAddress),
    addressLine1: clean(value.addressLine1),
    addressLine2: clean(value.addressLine2),
    locality: clean(value.locality),
    administrativeArea: clean(value.administrativeArea),
    postalCode: clean(value.postalCode),
    countryCode: clean(value.countryCode)?.toUpperCase() ?? "US",
    latitude: value.latitude,
    longitude: value.longitude,
  };
}

export function isStructuredAddressComplete(value: AddressValue): boolean {
  return Boolean(
    clean(value.addressLine1) &&
    clean(value.locality) &&
    clean(value.administrativeArea) &&
    clean(value.postalCode) &&
    clean(value.countryCode),
  );
}

export function addressLocalityLine(value: AddressValue): string {
  const regionAndPostcode = [
    clean(value.administrativeArea),
    clean(value.postalCode),
  ]
    .filter(Boolean)
    .join(" ");
  return [clean(value.locality), regionAndPostcode].filter(Boolean).join(", ");
}

export function formatAddress(value: AddressValue): string {
  const normalized = normalizeAddress(value);
  if (normalized.formattedAddress) return normalized.formattedAddress;
  if (!normalized.addressLine1) return "";
  return [
    normalized.addressLine1,
    normalized.addressLine2,
    addressLocalityLine(normalized),
    normalized.countryCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function addressCountryName(countryCode: string | undefined): string {
  const code = clean(countryCode)?.toUpperCase();
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function googleMapsHref(value: AddressValue): string {
  if (value.googleMapsUri) return value.googleMapsUri;
  const query =
    value.latitude !== undefined && value.longitude !== undefined
      ? `${value.latitude},${value.longitude}`
      : formatAddress(value);
  const parameters = new URLSearchParams({ api: "1", query });
  if (value.googlePlaceId) {
    parameters.set("query_place_id", value.googlePlaceId);
  }
  return `https://www.google.com/maps/search/?${parameters.toString()}`;
}

export function addressMapImageSrc(value: AddressValue): string {
  const parameters = new URLSearchParams();
  if (value.latitude !== undefined && value.longitude !== undefined) {
    parameters.set("latitude", String(value.latitude));
    parameters.set("longitude", String(value.longitude));
  } else {
    parameters.set("address", formatAddress(value));
  }
  return `/api/places/map?${parameters.toString()}`;
}
