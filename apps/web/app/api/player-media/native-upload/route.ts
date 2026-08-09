import { createApiContextFromRequest, createCaller } from "@duna/api";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  playerMediaMaximumBytes,
  playerMediaPath,
  validatePlayerMediaInput,
} from "@/lib/player-media-storage";

const minimumShortEdge = 1_080;
const minimumPixels = 2_000_000;

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "The action photo could not be uploaded.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return errorResponse(
        new Error("Player artwork storage is not configured."),
        503,
      );
    }
    const forwardedFor = request.headers.get("x-forwarded-for");
    const context = await createApiContextFromRequest(request, {
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ipAddress: forwardedFor?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    const caller = createCaller(context);
    const authorized = await caller.player.playerMediaUploadContext();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorResponse(new Error("Choose an action photo to upload."));
    }
    const media = validatePlayerMediaInput({
      contentType: file.type,
      size: file.size,
    });
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      Math.min(width, height) < minimumShortEdge ||
      width * height < minimumPixels
    ) {
      return errorResponse(
        new Error(
          "Choose a high-resolution photo (at least 1080px on the short edge).",
        ),
      );
    }
    if (file.size > playerMediaMaximumBytes) {
      return errorResponse(
        new Error("Action photos must be 15 MB or smaller."),
      );
    }
    const pathname = playerMediaPath({
      personId: authorized.personId,
      kind: "action",
      extension: media.extension,
    });
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000,
      contentType: media.contentType,
    });
    return NextResponse.json(
      {
        url: blob.url,
        kind: "action",
        contentType: media.contentType,
        size: file.size,
        width,
        height,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = /unauthorized|forbidden|required scope/i.test(message)
      ? 401
      : 400;
    return errorResponse(error, status);
  }
}
