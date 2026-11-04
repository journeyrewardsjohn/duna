import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processPendingWebsiteRevisions } from "@duna/api/website-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const received = Buffer.from(
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "",
  );
  if (
    !expected.length ||
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await processPendingWebsiteRevisions());
}
