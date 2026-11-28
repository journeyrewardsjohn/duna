// Concierge (B7): WhatsApp webhook (inbound replies and delivery status).
// Thin route; verification, idempotency and routing live in @duna/api.
import { receiveConciergeWhatsappWebhook } from "@duna/api/concierge-webhooks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 65536)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  try {
    const result = await receiveConciergeWhatsappWebhook({
      rawBody,
      headers: request.headers,
      now: new Date(),
    });
    return NextResponse.json(
      { received: result.status === 200 },
      { status: result.status },
    );
  } catch {
    // A non-2xx lets the provider retry; never acknowledge an unstored event.
    return NextResponse.json({ received: false }, { status: 503 });
  }
}
