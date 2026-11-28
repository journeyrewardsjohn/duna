import { providerNotConfiguredResponse } from "@duna/api";
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
    // Not set up here: an honest 200 state, not a failure (maps show it).
    return providerNotConfiguredResponse(
      "mapbox",
      "Maps need a public map key, which isn't set up yet.",
    );
  }
  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
