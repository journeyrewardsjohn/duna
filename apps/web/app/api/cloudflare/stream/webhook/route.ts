import { timingSafeEqual } from "node:crypto";
import { handleCloudflareLiveWebhook } from "@duna/api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function isAuthorizedCloudflareStreamWebhook(request: Request): boolean {
  const expected = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET?.trim();
  const provided =
    request.headers.get("cf-webhook-auth")?.trim() ||
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

export async function POST(request: Request) {
  if (!isAuthorizedCloudflareStreamWebhook(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await handleCloudflareLiveWebhook(await request.json());
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Cloudflare Stream webhook failed.",
      },
      { status: 400 },
    );
  }
}
