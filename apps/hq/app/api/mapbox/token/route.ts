import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const token = [
    process.env.MAPBOX_API_TOKEN_PUBLIC,
    process.env.mapbox_api_token_public,
    process.env.MAPBOX_API_TOKEN,
  ]
    .map((value) => value?.trim())
    .find((value) => value?.startsWith("pk."));
  if (!token) {
    return NextResponse.json(
      {
        error:
          "A public Mapbox token is not configured. Client maps require a pk token.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
