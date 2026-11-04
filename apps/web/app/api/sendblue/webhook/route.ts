import {
  authenticateSendblueWebhook,
  receiveSendblueInbound,
  sendblueInboundSchema,
} from "@duna/api/sendblue-ingress";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET;
  const numbers = (process.env.SENDBLUE_PHONE_NUMBERS ?? "")
    .split(",")
    .map((number) => number.trim())
    .filter(Boolean);
  if (!secret || secret.length < 32 || !numbers.length)
    return NextResponse.json(
      { error: "Messaging endpoint is not configured." },
      { status: 503 },
    );
  if (
    !authenticateSendblueWebhook(
      request.headers.get("sb-signing-secret"),
      secret,
    )
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 65536)
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  let payload: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 65536)
      return NextResponse.json(
        { error: "Payload too large." },
        { status: 413 },
      );
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = sendblueInboundSchema.safeParse(payload);
  if (
    !parsed.success ||
    !numbers.includes(parsed.data.to_number) ||
    (parsed.data.sendblue_number &&
      parsed.data.sendblue_number !== parsed.data.to_number)
  )
    return NextResponse.json(
      { error: "Invalid inbound message or endpoint." },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      received: true,
      ...(await receiveSendblueInbound(parsed.data, numbers)),
    });
  } catch {
    // A non-2xx response lets the provider retry; never acknowledge an unpersisted event.
    return NextResponse.json(
      { error: "Messaging storage is temporarily unavailable." },
      { status: 503 },
    );
  }
}
