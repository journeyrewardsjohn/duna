import { createApiContext, createCaller } from "@duna/api";

interface PublicCallerContext {
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export function createPublicCaller(context: PublicCallerContext = {}) {
  return createCaller(
    createApiContext({
      useDemoActor: false,
      requestId: context.requestId ?? crypto.randomUUID(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    }),
  );
}

export function createPublicCallerFromRequest(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return createPublicCaller({
    requestId: request.headers.get("x-request-id") ?? undefined,
    ipAddress: forwardedFor?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}
