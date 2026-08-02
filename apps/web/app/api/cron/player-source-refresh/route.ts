import {
  queueDuePlayerSourceRefreshes,
  recoverReadyWorkflowJobs,
} from "@duna/api";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);

  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queued = await queueDuePlayerSourceRefreshes({ limit: 25 });
  const processed =
    queued.queued > 0
      ? await recoverReadyWorkflowJobs({ limit: queued.queued })
      : { processed: 0, succeeded: 0, failed: 0 };

  return NextResponse.json({
    status: "ok",
    queued: queued.queued,
    processed,
  });
}
