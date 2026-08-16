import { timingSafeEqual } from "node:crypto";
import {
  ingestVideoAnalysisWorkerResult,
  videoAnalysisWorkerResultSchema,
} from "@duna/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function workerAuthorized(request: Request): boolean {
  const expected = process.env.DUNA_ANALYSIS_WORKER_TOKEN?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const received = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !received || expected.length !== received.length)
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function POST(request: Request) {
  if (!process.env.DUNA_ANALYSIS_WORKER_TOKEN?.trim()) {
    return new Response(null, { status: 404 });
  }
  if (!workerAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = videoAnalysisWorkerResultSchema.parse(await request.json());
    const run = await ingestVideoAnalysisWorkerResult({
      result,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      now: new Date(),
    });
    return Response.json(
      { accepted: true, run },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Analysis result was not accepted." },
      {
        status: 400,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
