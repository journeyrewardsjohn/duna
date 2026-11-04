import { authenticateSendblueWebhook } from "@duna/api/sendblue-ingress";
import {
  applyPhoneDeliveryStatus,
  phoneStatusSchema,
} from "@duna/api/sendblue-outbox";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (
    !authenticateSendblueWebhook(
      request.headers.get("sb-signing-secret"),
      process.env.SENDBLUE_WEBHOOK_SECRET,
    )
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Invalid receipt." }, { status: 400 });
  let payload;
  try {
    payload = phoneStatusSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  }
  try {
    await applyPhoneDeliveryStatus(id, payload);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Delivery receipt could not be applied." },
      { status: 503 },
    );
  }
}
