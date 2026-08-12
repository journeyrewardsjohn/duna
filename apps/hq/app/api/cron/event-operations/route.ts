import { reconcileScheduledDivisionSelections } from "@duna/api";
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
  try {
    return NextResponse.json(
      await reconcileScheduledDivisionSelections({
        now: new Date(),
        limit: 200,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Event qualification reconciliation failed.",
      },
      { status: 503 },
    );
  }
}
