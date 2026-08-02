import { NextResponse } from "next/server";

interface GooglePlaceDetails {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly formattedAddress?: string;
  readonly location?: {
    readonly latitude?: number;
    readonly longitude?: number;
  };
}

export async function GET(request: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Location details are not configured." },
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
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
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
  return NextResponse.json({
    placeId: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
  });
}
