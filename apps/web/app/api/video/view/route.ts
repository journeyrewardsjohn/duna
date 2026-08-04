import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as {
      readonly videoId?: string;
      readonly viewSessionId?: string;
      readonly watchedSeconds?: number;
      readonly completed?: boolean;
    };
    const caller = await getServerCaller();
    const result = await caller.public.videoViewHeartbeat({
      videoId: input.videoId ?? "",
      viewSessionId: input.viewSessionId ?? "",
      watchedSeconds: Math.floor(input.watchedSeconds ?? 0),
      completed: input.completed ?? false,
    });
    return Response.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "View progress was not accepted." },
      {
        status: 400,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
