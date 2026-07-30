import { appRouter, createApiContextFromRequest } from "@duna/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

function handler(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () =>
      createApiContextFromRequest(request, {
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
        ipAddress: forwardedFor?.split(",")[0]?.trim(),
        userAgent: request.headers.get("user-agent") ?? undefined,
      }),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `tRPC failure on ${path ?? "unknown"}:`,
              error.message,
            );
          }
        : undefined,
  });
}

export { handler as GET, handler as POST };
