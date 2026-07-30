import { constructStripeEvent } from "@duna/api/payments";
import { processStripeWebhook } from "@duna/api/webhooks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 },
    );
  }
  try {
    const event = constructStripeEvent(await request.text(), signature);
    const result = await processStripeWebhook(event);
    return NextResponse.json({
      received: true,
      eventId: event.id,
      duplicate: result.duplicate,
      action: result.action,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook verification failed",
      },
      { status: 400 },
    );
  }
}
