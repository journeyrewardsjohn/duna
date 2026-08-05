import { createApiContextFromRequest, createCaller } from "@duna/api";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

const supportedImages = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maximumBytes = 4_000_000;

function errorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "The product image could not be uploaded.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return errorResponse(
        new Error("Product image storage is not configured."),
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
    const authorized = await caller.operator.eventMediaUploadContext();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorResponse(new Error("Choose a product image to upload."));
    }
    const extension = supportedImages.get(file.type);
    if (!extension) {
      return errorResponse(
        new Error("Use a JPEG, PNG, or WebP product image."),
      );
    }
    if (file.size <= 0 || file.size > maximumBytes) {
      return errorResponse(
        new Error("Product images must be smaller than 4 MB."),
      );
    }
    const pathname = `products/${authorized.organizationId}/${crypto.randomUUID()}.${extension}`;
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000,
      contentType: file.type,
    });
    return NextResponse.json(
      {
        url: blob.url,
        kind: "image",
        contentType: file.type,
        size: file.size,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status =
      /unauthorized|forbidden|organization context|required scope/i.test(
        message,
      )
        ? 401
        : 400;
    return errorResponse(error, status);
  }
}
