import { TRPCError } from "@trpc/server";

export function assertAskDunaOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cross-origin writes are not allowed.",
    });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Send JSON to Ask Duna.",
    });
}

export async function readAskDunaJson(
  request: Request,
  limit = 32_768,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: "This request is too large.",
      });
    }
    chunks.push(next.value);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Send valid JSON to Ask Duna.",
    });
  }
}
