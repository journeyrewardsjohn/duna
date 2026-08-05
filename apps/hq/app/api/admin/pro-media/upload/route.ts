import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getServerCaller } from "@/lib/api";
import {
  assertProfessionalEventMediaPath,
  validateEventMediaInput,
} from "@/lib/media-storage";

interface ProfessionalMediaPayload {
  readonly professionalEventId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
}

function parseClientPayload(value: string | null): ProfessionalMediaPayload {
  if (!value) throw new Error("Professional media details are required.");
  const parsed = JSON.parse(value) as Partial<ProfessionalMediaPayload>;
  if (
    typeof parsed.professionalEventId !== "string" ||
    typeof parsed.fileName !== "string" ||
    typeof parsed.contentType !== "string" ||
    typeof parsed.size !== "number"
  ) {
    throw new Error("Professional media details are invalid.");
  }
  return {
    professionalEventId: parsed.professionalEventId,
    fileName: parsed.fileName,
    contentType: parsed.contentType,
    size: parsed.size,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const caller = await getServerCaller();
        const context = await caller.admin.professionalEventMediaUploadContext({
          professionalEventId: payload.professionalEventId,
        });
        const media = validateEventMediaInput(payload);
        assertProfessionalEventMediaPath(
          pathname,
          context.professionalEventId,
          media.extension,
        );
        return {
          addRandomSuffix: false,
          allowOverwrite: false,
          allowedContentTypes: [media.contentType],
          cacheControlMaxAge: 31_536_000,
          maximumSizeInBytes: media.maxBytes,
          tokenPayload: JSON.stringify({
            professionalEventId: context.professionalEventId,
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
            : "The professional media upload could not be authorized.",
      },
      { status: 400 },
    );
  }
}
