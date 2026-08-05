import { NextResponse } from "next/server";

function fallbackMap(): Response {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Map preview">
      <rect width="640" height="360" fill="#eaf3ed"/>
      <path d="M-20 270C100 205 122 95 252 112s140 132 408 78" fill="none" stroke="#fff" stroke-width="28"/>
      <path d="M-10 62c150 64 238 7 360 50s158 130 310 95" fill="none" stroke="#d7e2e9" stroke-width="9"/>
      <path d="M104-20c34 105 9 203 86 400M445-20c-32 112 30 185-8 400" fill="none" stroke="#fff" stroke-width="14"/>
      <path d="M0 315c118-30 180 12 304-28s202-24 336 4" fill="none" stroke="#c9e2f1" stroke-width="36"/>
      <circle cx="320" cy="170" r="24" fill="#255f9f" stroke="#fff" stroke-width="8"/>
      <path d="M320 229c-26-35-42-53-42-78a42 42 0 1 1 84 0c0 25-16 43-42 78Z" fill="#255f9f" stroke="#fff" stroke-width="8"/>
      <circle cx="320" cy="151" r="12" fill="#fff"/>
      <text x="24" y="334" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#255f9f">Duna map preview</text>
    </svg>`;
  return new Response(svg, {
    headers: {
      "Cache-Control": "private, max-age=300",
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

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return fallbackMap();

  const location = hasCoordinates ? `${latitude},${longitude}` : address;
  const parameters = new URLSearchParams({
    center: location,
    zoom: "15",
    size: "640x360",
    scale: "2",
    format: "png",
    maptype: "roadmap",
    markers: `size:mid|color:0x255f9f|${location}`,
    key,
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/staticmap?${parameters.toString()}`,
      { cache: "no-store" },
    );
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) {
      return fallbackMap();
    }
    return new Response(await response.arrayBuffer(), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type": contentType,
      },
    });
  } catch {
    return fallbackMap();
  }
}
