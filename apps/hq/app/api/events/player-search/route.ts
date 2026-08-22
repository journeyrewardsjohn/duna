import { NextResponse } from "next/server";
import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ players: [] });
  try {
    const caller = await getServerCaller();
    const players = await caller.operator.searchEventPlayers({
      sessionId,
      query,
    });
    return NextResponse.json({ players });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Player search is unavailable.",
      },
      { status: 403 },
    );
  }
}
