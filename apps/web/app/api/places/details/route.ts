import { NextResponse } from "next/server";
import {
  PLACES_CACHE_TTL_MS,
  placesRateLimit,
  sessionTokenFrom,
  ShortCache,
} from "../guard";

interface GooglePlaceDetails {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly formattedAddress?: string;
  readonly location?: {
    readonly latitude?: number;
    readonly longitude?: number;
  };
}

interface PlaceDetails {
  readonly placeId?: string;
  readonly name?: string;
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

/** The same place, for ten minutes. */
const cache = new ShortCache<PlaceDetails>(PLACES_CACHE_TTL_MS, 500);

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
  const limited = await placesRateLimit(request, "details");
  if (limited) return limited;
  const cached = cache.get(placeId);
  if (cached) return NextResponse.json(cached);

  // The details call ends the picker's session (the provider bills the
  // keystrokes and this call together).
  const sessionToken = sessionTokenFrom(request);
  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
  );
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "Location details are temporarily unavailable." },
      { status: 502 },
    );
  }
  const place = (await response.json()) as GooglePlaceDetails;
  const details: PlaceDetails = {
    placeId: place.id,
    name: place.displayName?.text,
    address: place.formattedAddress,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
  };
  cache.set(placeId, details);
  return NextResponse.json(details);
}
