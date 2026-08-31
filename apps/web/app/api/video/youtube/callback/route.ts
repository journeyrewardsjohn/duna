import { completeYoutubeChannelConnection } from "@duna/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim();
  const code = url.searchParams.get("code")?.trim();
  const oauthError = url.searchParams.get("error")?.trim();
  if (!state || !code || oauthError) {
    return redirect(
      `duna://video?youtube=error&reason=${encodeURIComponent(oauthError || "authorization-cancelled")}`,
    );
  }
  try {
    const completed = await completeYoutubeChannelConnection({
      state,
      code,
      now: new Date(),
    });
    const returnUrl = new URL(completed.returnUrl);
    returnUrl.searchParams.set("youtube", "connected");
    returnUrl.searchParams.set("channel", completed.channel.channelTitle);
    return redirect(returnUrl.toString());
  } catch (error) {
    return redirect(
      `duna://video?youtube=error&reason=${encodeURIComponent(error instanceof Error ? error.message : "connection-failed")}`,
    );
  }
}
