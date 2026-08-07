import { createApiContext, createCaller } from "@duna/api";

export function createPublicCallerFromRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return createCaller(
    createApiContext({
      useDemoActor: false,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      ipAddress: forwardedFor?.split(",")[0]?.trim(),
      userAgent: request.headers.get("user-agent") ?? undefined,
    }),
  );
}
