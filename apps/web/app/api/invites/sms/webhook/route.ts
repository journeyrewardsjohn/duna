// INVITE-SMS: delivery receipts and opt-outs for invitation texts.
// Thin route; signature check, idempotency and updates live in @duna/api.
import {
  PRELUDE_SIGNATURE_HEADER,
  receiveInviteSmsWebhook,
} from "@duna/api/invite-sms-webhook";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > 64 * 1024) {
    return NextResponse.json({ received: false }, { status: 413 });
  }
  try {
    const result = await receiveInviteSmsWebhook({
      rawBody,
      signature: request.headers.get(PRELUDE_SIGNATURE_HEADER),
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
