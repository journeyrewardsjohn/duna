import { processQueuedVisionImprovementProposals } from "@duna/api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.VERCEL_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Bounded, derived-evidence-only processor. Analysis ingestion only creates
 * the unique queue record, keeping the worker callback independent of the AI
 * Gateway. This route cannot train or promote a Vision model.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(
      await processQueuedVisionImprovementProposals({
        limit: 10,
        now: new Date(),
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ipAddress: request.headers
          .get("x-forwarded-for")
          ?.split(",")[0]
          ?.trim(),
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Vision improvement processor failed.",
      },
      { status: 503 },
    );
  }
}
