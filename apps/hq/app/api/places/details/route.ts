import { NextResponse } from "next/server";

interface GooglePlaceDetails {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly formattedAddress?: string;
  readonly location?: {
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly primaryType?: string;
  readonly googleMapsUri?: string;
  readonly addressComponents?: readonly {
    readonly longText?: string;
    readonly shortText?: string;
    readonly types?: readonly string[];
  }[];
}

export async function GET(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Google Places is not configured." },
      { status: 503 },
    );
  }
  const placeId =
    new URL(request.url).searchParams.get("placeId")?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(placeId)) {
    return NextResponse.json({ error: "Invalid place ID." }, { status: 400 });
  }
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,primaryType,googleMapsUri,addressComponents",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    return NextResponse.json(
      { error: "Location details are temporarily unavailable." },
      { status: 502 },
    );
  }
  const place = (await response.json()) as GooglePlaceDetails;
  const component = (type: string, short = false) => {
    const value = place.addressComponents?.find((entry) =>
      entry.types?.includes(type),
    );
    return short ? value?.shortText : value?.longText;
  };
  const street = [
    component("street_number"),
    component("route", true) ?? component("route"),
  ]
    .filter(Boolean)
    .join(" ");
  return NextResponse.json({
    placeId: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    primaryType: place.primaryType,
    googleMapsUri: place.googleMapsUri,
    addressLine1: street || place.formattedAddress,
    locality:
      component("locality") ??
      component("postal_town") ??
      component("sublocality"),
    administrativeArea: component("administrative_area_level_1", true),
    postalCode: component("postal_code"),
    countryCode: component("country", true),
  });
}
