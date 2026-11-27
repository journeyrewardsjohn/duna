import { processDueCatalogParticipation } from "@duna/api";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

// Applies player minimums and group-size pricing once a session's cutoff has
// passed: cancels and refunds under-filled sessions, and returns unused
// reserved credits. Every step is idempotent, so overlapping runs are safe.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await processDueCatalogParticipation({
    now: new Date(),
    limit: 50,
  });
  return NextResponse.json({ status: "ok", ...processed });
}
