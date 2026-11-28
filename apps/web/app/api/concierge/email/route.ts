// Concierge (B7): email webhook (inbound replies and delivery events).
// Thin route; verification, idempotency and routing live in @duna/api.
import { receiveConciergeEmailWebhook } from "@duna/api/concierge-webhooks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 262144)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  try {
    const result = await receiveConciergeEmailWebhook({
      rawBody,
      headers: request.headers,
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
