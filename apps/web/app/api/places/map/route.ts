import { NextResponse } from "next/server";
import {
  geocodedCoordinates,
  mapboxStaticImageUrl,
  publicMapboxToken,
} from "../../../../lib/static-map";

function fallbackMap(): Response {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="Map preview">
      <rect width="960" height="540" fill="#eef4f1"/>
      <path d="M-40 420C145 305 205 126 390 170s210 200 610 92" fill="none" stroke="#fff" stroke-width="42"/>
      <path d="M-20 92c218 96 350 12 535 78s235 192 485 132" fill="none" stroke="#d6e4ea" stroke-width="14"/>
      <path d="M162-30c50 158 18 304 134 610M680-30c-48 170 42 282-12 610" fill="none" stroke="#fff" stroke-width="22"/>
      <path d="M0 474c188-48 282 18 474-42s310-38 506 6" fill="none" stroke="#c9e5ef" stroke-width="54"/>
      <path d="M480 360c-40-54-66-84-66-124a66 66 0 1 1 132 0c0 40-26 70-66 124Z" fill="#0d6370" stroke="#fff" stroke-width="12"/>
      <circle cx="480" cy="236" r="19" fill="#fff"/>
      <text x="36" y="502" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#0d6370">Event location</text>
    </svg>`;
  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const latitudeValue = requestUrl.searchParams.get("latitude")?.trim();
  const longitudeValue = requestUrl.searchParams.get("longitude")?.trim();
  const address = requestUrl.searchParams.get("address")?.trim() ?? "";
  const latitude = latitudeValue ? Number(latitudeValue) : undefined;
  const longitude = longitudeValue ? Number(longitudeValue) : undefined;
  const hasCoordinates =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (!hasCoordinates && (!address || address.length > 320)) {
    return NextResponse.json(
      { error: "A valid map location is required." },
      { status: 400 },
    );
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const location = hasCoordinates ? `${latitude},${longitude}` : address;
  if (googleKey) {
    const parameters = new URLSearchParams({
      center: location,
      zoom: "15",
      size: "960x540",
      scale: "2",
      format: "png",
      maptype: "roadmap",
      markers: `size:mid|color:0x0d6370|${location}`,
      key: googleKey,
    });
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/staticmap?${parameters.toString()}`,
        { next: { revalidate: 86_400 } },
      );
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.startsWith("image/")) {
        return new Response(await response.arrayBuffer(), {
          headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Content-Type": contentType,
          },
        });
      }
    } catch {
      // Mapbox below remains an independent raster fallback.
    }
  }

  const mapboxToken = publicMapboxToken(process.env);
  if (!mapboxToken) return fallbackMap();
  let coordinates = hasCoordinates
    ? { latitude: latitude!, longitude: longitude! }
    : undefined;
  if (!coordinates) {
    try {
      const parameters = new URLSearchParams({
        q: address,
        limit: "1",
        access_token: mapboxToken,
      });
      const response = await fetch(
        `https://api.mapbox.com/search/geocode/v6/forward?${parameters.toString()}`,
        { next: { revalidate: 86_400 } },
      );
      if (response.ok) coordinates = geocodedCoordinates(await response.json());
    } catch {
      coordinates = undefined;
    }
  }
  if (!coordinates) return fallbackMap();
  try {
    const response = await fetch(
      mapboxStaticImageUrl({ ...coordinates, token: mapboxToken }),
      { next: { revalidate: 86_400 } },
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return fallbackMap();
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "Content-Type": contentType,
      },
    });
  } catch {
    return fallbackMap();
  }
}
