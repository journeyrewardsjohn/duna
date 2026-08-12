import { consumeRateLimit } from "@duna/api/rate-limit";
import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getServerCaller } from "@/lib/api";
import {
  createProductMediaPath,
  validateEventMediaInput,
} from "@/lib/media-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

interface GenerateProductImageBody {
  readonly offerName?: unknown;
  readonly offerType?: unknown;
  readonly prompt?: unknown;
}

function inputString(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Duna could not create this image right now.";
  const status = message.includes("too many") ? 429 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  return NextResponse.json(
    { available: Boolean(process.env.HF_CREDENTIALS) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const credentials = process.env.HF_CREDENTIALS;
    if (!credentials) {
      throw new Error(
        "Custom cover creation is not connected yet. Choose a Duna image or upload your own for now.",
      );
    }
    const body = (await request.json()) as GenerateProductImageBody;
    const offerName = inputString(body.offerName, 140);
    const offerType = inputString(body.offerType, 80);
    const prompt = inputString(body.prompt, 600);
    if (offerName.length < 2 || prompt.length < 8) {
      throw new Error(
        "Add an offer name and a short description of the image you want.",
      );
    }

    const caller = await getServerCaller();
    const context = await caller.operator.eventMediaUploadContext();
    const rateLimit = await consumeRateLimit({
      key: `hq-product-image:${context.organizationId}`,
      capacity: 12,
      refillPerMinute: 0.025,
      now: new Date(),
    });
    if (!rateLimit.allowed) {
      throw new Error(
        "This organization has created too many covers today. Try again later or choose from the Duna library.",
      );
    }

    const client = createHiggsfieldClient({
      credentials,
      maxPollTime: 240_000,
      pollInterval: 2_500,
      timeout: 120_000,
    });
    const artDirection = [
      "Create a premium editorial commerce photograph for Duna, a modern beach volleyball platform.",
      `The customer offer is ${offerName}${offerType ? `, a ${offerType}` : ""}.`,
      `Creative direction: ${prompt}.`,
      "Natural coastal light, believable beach-club setting, refined sand and ocean palette, candid athletic energy, high-end hospitality campaign, realistic materials and people.",
      "No words, letters, numbers, watermarks, brand marks, UI, borders, or fake logos. Leave calm negative space for product-page copy. Landscape 4:3 composition.",
    ].join(" ");
    const result = await client.subscribe(
      "flux-pro/kontext/max/text-to-image",
      {
        input: {
          aspect_ratio: "4:3",
          prompt: artDirection,
          safety_tolerance: 2,
        },
        withPolling: true,
      },
    );
    const generatedUrl = result.images?.[0]?.url;
    if (result.status !== "completed" || !generatedUrl) {
      throw new Error(
        result.status === "nsfw"
          ? "Higgsfield could not use that description. Try a simple club, lesson, or product scene."
          : "Higgsfield did not finish this cover. Please try again.",
      );
    }

    const generated = await fetch(generatedUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    if (!generated.ok) {
      throw new Error(
        "The generated cover could not be saved. Please try again.",
      );
    }
    const contentType = generated.headers.get("content-type")?.split(";")[0];
    const bytes = Buffer.from(await generated.arrayBuffer());
    const validated = validateEventMediaInput({
      fileName: "higgsfield-product-cover",
      contentType: contentType ?? "",
      size: bytes.byteLength,
    });
    if (validated.kind !== "image") {
      throw new Error("Higgsfield returned an unsupported cover format.");
    }
    const pathname = createProductMediaPath(
      context.organizationId,
      validated.contentType,
    );
    const stored = await put(pathname, bytes, {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000,
      contentType: validated.contentType,
    });
    return NextResponse.json({
      url: stored.url,
      alt: `${offerName} at a beach volleyball club`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
