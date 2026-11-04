import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getServerContext } from "@/lib/api";
import {
  assertWebsiteActor,
  cancelWebsiteSubscription,
  openWebsiteBillingPortal,
  startWebsiteCheckout,
} from "@duna/api/website-billing";
import {
  createClubWebsite,
  updateWebsiteBrief,
  getClubWebsite,
  listClubWebsites,
  processWebsiteRevision,
  requestWebsiteRevision,
  websitePreview,
  websitePublishPages,
} from "@duna/api/website-service";
import {
  connectWebsiteDomain,
  websiteHostingReadiness,
  publishWebsiteRevision,
  readPublishStatus,
} from "@duna/api/website-provisioning";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
const publicErrors = new Set([
  "Website hosting connection could not be verified. Contact Duna before starting your subscription.",
  "Website publishing could not finish. Check publishing status to resume safely.",
  "Website hosting is not connected yet. Contact Duna to finish hosting setup.",
  "Activate your website subscription before publishing.",
  "Website publishing is already in progress. Check its status shortly.",
  "Publish your website before connecting its domain.",
  "The website is built but its live health check has not passed yet. Check again shortly.",
  "Use a public HTTPS website address.",
  "Website not found in this club.",
  "Website was not found in this club.",
  "An authorized club owner is required.",
  "This club already has three websites. Open an existing site to continue editing.",
  "Wait for the current edit to finish before changing website references.",
  "This request ID was already used for a different edit.",
  "Website generation is temporarily unavailable. Your saved site is unchanged.",
  "Please wait before starting another website edit.",
  "An edit is already in progress. Review it before starting another.",
  "Free preview attempts refresh after 24 hours. Your saved website is unchanged.",
  "Website import is unavailable. Remove reference URLs or try again later.",
  "This preview is not ready.",
  "Choose a completed preview to publish.",
  "This website already has a subscription. Open billing management.",
  "Website billing is not active yet.",
  "An active website subscription is required for AI edits.",
  "Not enough website AI credits. Your published website stays online.",
]);
function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unable to complete this request.";
  const safe =
    error instanceof z.ZodError
      ? "Check the details and try again."
      : publicErrors.has(message)
        ? message
        : "Duna could not confirm this request. Refresh the website status before trying again.";
  return NextResponse.json(
    { error: safe },
    {
      status: /sign in|unauthorized/i.test(message)
        ? 401
        : /owner|permission|access|club context/i.test(message)
          ? 403
          : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export async function GET(request: Request) {
  try {
    const { actor } = await getServerContext();
    if (!actor)
      return NextResponse.json(
        { error: "Sign in to manage your club website." },
        { status: 401 },
      );
    assertWebsiteActor(actor);
    const query = new URL(request.url).searchParams;
    const siteId = query.get("siteId");
    if (!siteId)
      return NextResponse.json(
        { sites: await listClubWebsites(actor) },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (query.get("preview")) {
      const html = await websitePreview(
        actor,
        siteId,
        query.get("preview")!,
        query.get("page") || "home",
      );
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline' https://api.fontshare.com; font-src https://cdn.fontshare.com https://api.fontshare.com; img-src https: data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      });
    }
    if (query.get("status")) await readPublishStatus(actor, siteId);
    return NextResponse.json(
      {
        ...(await getClubWebsite(actor, siteId)),
        hostingAvailable: websiteHostingReadiness().configured,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel-subscription"), siteId: z.uuid() }),
  z.object({
    action: z.literal("references"),
    siteId: z.uuid(),
    brief: z.string(),
    sourceUrl: z.string().optional(),
    inspirationUrls: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("create"),
    name: z.string(),
    brief: z.string(),
    sourceUrl: z.string().optional(),
    inspirationUrls: z.array(z.string()).optional(),
  }),
  z.object({
    action: z.literal("generate"),
    siteId: z.uuid(),
    prompt: z.string(),
    operationId: z.uuid(),
  }),
  z.object({
    action: z.literal("publish"),
    siteId: z.uuid(),
    revisionId: z.uuid(),
  }),
  z.object({
    action: z.literal("domain"),
    siteId: z.uuid(),
    domain: z.string().max(253),
  }),
  z.object({
    action: z.literal("checkout"),
    siteId: z.uuid(),
    operationId: z.uuid(),
  }),
  z.object({ action: z.literal("billing"), siteId: z.uuid() }),
]);
export async function POST(request: Request) {
  if (
    !request.headers.get("origin") ||
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return NextResponse.json(
      { error: "This request must come from your Duna HQ session." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") || 0) > 30000)
    return NextResponse.json(
      { error: "Request is too large." },
      { status: 413 },
    );
  try {
    const { actor } = await getServerContext();
    if (!actor)
      return NextResponse.json(
        { error: "Sign in to manage your club website." },
        { status: 401 },
      );
    assertWebsiteActor(actor);
    const raw = await request.text();
    if (raw.length > 30000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    const body = actionSchema.parse(JSON.parse(raw));
    const origin = new URL(request.url).origin;
    switch (body.action) {
      case "cancel-subscription":
        return NextResponse.json(
          await cancelWebsiteSubscription({ actor, siteId: body.siteId }),
        );
      case "references":
        return NextResponse.json({
          site: await updateWebsiteBrief(actor, body),
        });
      case "create":
        return NextResponse.json({
          site: await createClubWebsite(actor, body),
        });
      case "generate": {
        const revision = await requestWebsiteRevision(actor, body);
        after(() => processWebsiteRevision(revision.id));
        return NextResponse.json({ revision }, { status: 202 });
      }
      case "publish":
        return NextResponse.json(
          await publishWebsiteRevision(
            actor,
            body.siteId,
            body.revisionId,
            await websitePublishPages(actor, body.siteId, body.revisionId),
          ),
        );
      case "domain":
        return NextResponse.json(
          await connectWebsiteDomain(actor, body.siteId, body.domain),
        );
      case "checkout":
        if (!websiteHostingReadiness().configured)
          throw new Error(
            "Website hosting is not connected yet. Contact Duna to finish hosting setup.",
          );
        return NextResponse.json(
          await startWebsiteCheckout({
            actor,
            siteId: body.siteId,
            successUrl: `${origin}/website?site=${body.siteId}&checkout=success`,
            cancelUrl: `${origin}/website?site=${body.siteId}&checkout=canceled`,
            idempotencyKey: body.operationId,
          }),
        );
      case "billing":
        return NextResponse.json(
          await openWebsiteBillingPortal({
            actor,
            siteId: body.siteId,
            returnUrl: `${origin}/website?site=${body.siteId}`,
          }),
        );
    }
  } catch (error) {
    return failure(error);
  }
}
