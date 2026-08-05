import {
  refreshAvpLeague,
  refreshActiveFivbEvents,
  refreshFivbEventIndex,
  refreshSandRatingNetwork,
  refreshWorldRankings,
  researchUpcomingProfessionalEvents,
} from "@duna/api";
import { NextResponse } from "next/server";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mode = new URL(request.url).searchParams.get("mode") ?? "live";
  try {
    if (mode === "rankings") {
      return NextResponse.json(await refreshWorldRankings({}));
    }
    if (mode === "index") {
      return NextResponse.json(await refreshFivbEventIndex({}));
    }
    if (mode === "live") {
      return NextResponse.json(await refreshActiveFivbEvents({ limit: 4 }));
    }
    if (mode === "avp") {
      return NextResponse.json(await refreshAvpLeague({}));
    }
    if (mode === "research") {
      return NextResponse.json(
        await researchUpcomingProfessionalEvents({ limit: 2 }),
      );
    }
    if (mode === "sandrating") {
      return NextResponse.json(
        await refreshSandRatingNetwork({
          maxDepth: 4,
          topPlayersPerGender: 200,
        }),
      );
    }
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Sand data refresh failed.",
      },
      { status: 503 },
    );
  }
}
