import { recoverReadyWorkflowJobs } from "@duna/api";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await recoverReadyWorkflowJobs({ limit: 100 });
  return NextResponse.json({
    status: "ok",
    processed: results.length,
    succeeded: results.filter((result) => result.status === "succeeded").length,
    retrying: results.filter((result) => result.status === "retry").length,
    failed: results.filter((result) => result.status === "failed").length,
  });
}
