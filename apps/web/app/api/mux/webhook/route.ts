import { handleMuxVideoWebhook, unwrapMuxWebhook } from "@duna/api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const event = await unwrapMuxWebhook(await request.text(), request.headers);
    const result = await handleMuxVideoWebhook(event);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Mux webhook verification failed.",
      },
      { status: 400 },
    );
  }
}
