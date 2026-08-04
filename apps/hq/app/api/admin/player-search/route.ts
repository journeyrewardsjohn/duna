import { NextResponse } from "next/server";
import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ players: [] });
  }
  try {
    const caller = await getServerCaller();
    const players = await caller.admin.sandPlayerSearch({ query });
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
