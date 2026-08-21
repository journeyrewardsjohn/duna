import {
  activeOrganizationIdFromCookie,
  createApiContextFromRequest,
  createApiContextFromWorkOSSession,
  isWorkOSAuthKitConfigured,
  transcribeDunaAiAudio,
} from "@duna/api";
import { withAuth } from "@workos-inc/authkit-nextjs";

async function actorFromRequest(request: Request) {
  const contextInput = {
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
  const configured = isWorkOSAuthKitConfigured();
  const bearerRequest = request.headers
    .get("authorization")
    ?.startsWith("Bearer ");
  const session = configured && !bearerRequest ? await withAuth() : undefined;
  return bearerRequest
    ? createApiContextFromRequest(request, contextInput)
    : configured
      ? createApiContextFromWorkOSSession(
          {
            user: session?.user,
            organizationId: session?.organizationId,
            role: session?.role,
            roles: session?.roles,
            dunaOrganizationId: activeOrganizationIdFromCookie(
              request.headers.get("cookie"),
            ),
          },
          contextInput,
        )
      : createApiContextFromRequest(request, contextInput);
}

export async function POST(request: Request) {
  try {
    const context = await actorFromRequest(request);
    if (!context.actor)
      return Response.json(
        { error: "Sign in to use voice input." },
        { status: 401 },
      );
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || !audio.type.startsWith("audio/"))
      return Response.json(
        { error: "Attach an audio recording." },
        { status: 400 },
      );
    if (audio.size > 12 * 1024 * 1024)
      return Response.json(
        { error: "Keep voice notes under 12 MB." },
        { status: 413 },
      );
    const text = await transcribeDunaAiAudio({
      actor: context.actor,
      audio,
      filename: audio.name || "duna-voice.webm",
      now: context.now,
    });
    return Response.json({ text });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Voice transcription is unavailable.";
    return Response.json({ error: message }, { status: 400 });
  }
}
