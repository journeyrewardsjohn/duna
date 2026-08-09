import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getServerCaller } from "@/lib/api";
import {
  assertPlayerMediaPath,
  playerMediaMaximumBytes,
  validatePlayerMediaInput,
} from "@/lib/player-media-storage";

type PlayerMediaPayload = {
  readonly personId: string;
  readonly kind: "action" | "portrait";
  readonly contentType: string;
  readonly size: number;
  readonly width: number;
  readonly height: number;
};

function parsePayload(value: string | null): PlayerMediaPayload {
  if (!value) throw new Error("Player image details are required.");
  const parsed = JSON.parse(value) as Partial<PlayerMediaPayload>;
  if (
    typeof parsed.personId !== "string" ||
    (parsed.kind !== "action" && parsed.kind !== "portrait") ||
    typeof parsed.contentType !== "string" ||
    typeof parsed.size !== "number" ||
    typeof parsed.width !== "number" ||
    typeof parsed.height !== "number"
  ) {
    throw new Error("Player image details are invalid.");
  }
  return parsed as PlayerMediaPayload;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        const caller = await getServerCaller();
        const context = await caller.player.playerMediaUploadContext();
        if (payload.personId !== context.personId) {
          throw new Error("Player images must stay inside your own profile.");
        }
        const media = validatePlayerMediaInput(payload);
        if (
          payload.width < 1_080 ||
          payload.height < 1_080 ||
          payload.width * payload.height < 2_000_000
        ) {
          throw new Error(
            "Choose a high-resolution photo (at least 1080px on the short edge).",
          );
        }
        assertPlayerMediaPath(pathname, {
          personId: context.personId,
          kind: payload.kind,
          extension: media.extension,
        });
        return {
          addRandomSuffix: false,
          allowOverwrite: false,
          allowedContentTypes: [media.contentType],
          cacheControlMaxAge: 31_536_000,
          maximumSizeInBytes: playerMediaMaximumBytes,
          tokenPayload: JSON.stringify({
            personId: context.personId,
            kind: payload.kind,
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
            : "The player image could not be authorized.",
      },
      { status: 400 },
    );
  }
}
