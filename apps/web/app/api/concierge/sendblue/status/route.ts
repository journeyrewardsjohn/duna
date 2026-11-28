// Concierge (B7): Sendblue status callback for one iMessage delivery.
// Thin route; the check and the forward-only update live in @duna/api.
import { receiveConciergeSendblueStatus } from "@duna/api/concierge-webhooks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  }
  try {
    const result = await receiveConciergeSendblueStatus({
      signingSecret: request.headers.get("sb-signing-secret"),
      deliveryId: new URL(request.url).searchParams.get("delivery"),
      body,
      now: new Date(),
    });
    return NextResponse.json(
      { received: result.status === 200 },
      { status: result.status },
    );
  } catch {
    return NextResponse.json({ received: false }, { status: 503 });
  }
}
