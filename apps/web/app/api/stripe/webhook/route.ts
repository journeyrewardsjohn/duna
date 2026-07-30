import { constructStripeEvent } from "@duna/api/payments";
import { processStripeWebhook } from "@duna/api/webhooks";
import { processWorkflowJobById } from "@duna/api";
import { NextResponse } from "next/server";
import { inngest } from "../../inngest/client";

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
    let dispatched = false;
    let processedFallback = false;
    if (result.workflowJobId) {
      try {
        await inngest.send({
          id: `workflow-${result.workflowJobId}`,
          name: "duna/workflow.enqueued",
          data: { jobId: result.workflowJobId },
        });
        dispatched = true;
      } catch (error) {
        console.error(
          "Stripe workflow dispatch failed; processing the durable job inline.",
          error,
        );
        await processWorkflowJobById(result.workflowJobId);
        processedFallback = true;
      }
    }
    return NextResponse.json({
      received: true,
      eventId: event.id,
      duplicate: result.duplicate,
      action: result.action,
      queued: Boolean(result.workflowJobId),
      dispatched,
      processedFallback,
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
