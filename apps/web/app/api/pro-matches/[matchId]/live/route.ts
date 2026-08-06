import { loadPublicProfessionalMatchLive } from "@duna/api";
import { NextResponse } from "next/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly matchId: string }> },
) {
  const { matchId } = await context.params;
  if (!uuidPattern.test(matchId)) {
    return NextResponse.json({ error: "Invalid match ID." }, { status: 400 });
  }
  const live = await loadPublicProfessionalMatchLive(matchId).catch(
    () => undefined,
  );
  if (!live) {
    return NextResponse.json(
      { error: "Official live scoring is not available for this match." },
      { status: 404 },
    );
  }
  return NextResponse.json(live, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
