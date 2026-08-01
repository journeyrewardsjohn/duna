import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getServerCaller } from "@/lib/api";
import {
  assertEventMediaPath,
  assertVenueMediaPath,
  validateEventMediaInput,
} from "@/lib/media-storage";

interface EventMediaClientPayload {
  readonly organizationId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly purpose?: "event" | "venue";
}

function parseClientPayload(value: string | null): EventMediaClientPayload {
  if (!value) throw new Error("Event media details are required.");
  const parsed = JSON.parse(value) as Partial<EventMediaClientPayload>;
  if (
    typeof parsed.organizationId !== "string" ||
    typeof parsed.fileName !== "string" ||
    typeof parsed.contentType !== "string" ||
    typeof parsed.size !== "number"
  ) {
    throw new Error("Event media details are invalid.");
  }
  return {
    organizationId: parsed.organizationId,
    fileName: parsed.fileName,
    contentType: parsed.contentType,
    size: parsed.size,
    purpose: parsed.purpose === "venue" ? "venue" : "event",
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const caller = await getServerCaller();
        const context = await caller.operator.eventMediaUploadContext();
        const payload = parseClientPayload(clientPayload);
        if (payload.organizationId !== context.organizationId) {
          throw new Error("Event media must stay inside your organization.");
        }
        const media = validateEventMediaInput(payload);
        if (payload.purpose === "venue") {
          if (media.kind !== "image") {
            throw new Error("Venue media must be an image.");
          }
          assertVenueMediaPath(
            pathname,
            context.organizationId,
            media.extension,
          );
        } else {
          assertEventMediaPath(
            pathname,
            context.organizationId,
            media.extension,
          );
        }
        return {
          addRandomSuffix: false,
          allowOverwrite: false,
          allowedContentTypes: [media.contentType],
          cacheControlMaxAge: 31_536_000,
          maximumSizeInBytes: media.maxBytes,
          tokenPayload: JSON.stringify({
            organizationId: context.organizationId,
            kind: media.kind,
            pathname,
          }),
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The event media upload could not be authorized.",
      },
      { status: 400 },
    );
  }
}
