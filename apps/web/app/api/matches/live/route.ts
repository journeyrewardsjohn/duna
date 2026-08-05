import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const matchId = new URL(request.url).searchParams.get("matchId") ?? "";
  try {
    const caller = await getServerCaller();
    const scoring = await caller.public.liveMatch({ matchId });
    return Response.json(
      {
        score: {
          setIndex: scoring.score.setIndex,
          sets: scoring.score.sets.map((set) => ({ a: set.a, b: set.b })),
          serving: scoring.score.serving,
          status: scoring.score.status,
        },
      },
      {
        headers: {
          "cache-control": "public, max-age=1, stale-while-revalidate=2",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Live scoring is not available for this match." },
      {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
