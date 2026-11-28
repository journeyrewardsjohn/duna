import { cleanUpScoreDrafts } from "@duna/api";
import { log } from "@duna/observability";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

// Daily: deletes anonymous score drafts seven days after they were started
// (claimed or not) and clears maps-provider content older than 30 days from
// candidate venues (the place id stays). Bounded and idempotent; responses
// and logs carry counts only (docs/product/add-score.md).
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await cleanUpScoreDrafts({ now: new Date() });
  log.info("addScore.cleanup.completed", { ...result });
  return NextResponse.json({ status: "ok", ...result });
}
