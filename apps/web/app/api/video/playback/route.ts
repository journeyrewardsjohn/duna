import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId") ?? "";
  const accessToken = url.searchParams.get("token") ?? undefined;
  try {
    const caller = await getServerCaller();
    const playback = await caller.public.videoPlayback({
      videoId,
      accessToken,
      platform: "web",
    });
    return Response.json(
      { playback },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "This video could not be opened.",
      },
      {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
