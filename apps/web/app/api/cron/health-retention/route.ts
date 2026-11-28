import { runHealthRetention } from "@duna/api";
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

// Daily Duna Health maintenance: refreshes stored age bands from birth dates,
// deletes samples and check-ins past the retention window (24 months, or 12
// for anyone under 18 today) and finishes scheduled withdrawals. Bounded
// batches; idempotent, so overlapping or repeated runs are safe. Responses
// and logs carry counts only.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runHealthRetention({ now: new Date() });
  console.info("health-retention", result);
  return NextResponse.json({ status: "ok", ...result });
}
