import {
  appRouter,
  createApiContextFromRequest,
  observeHttpError,
} from "@duna/api";
import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@duna/observability";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

function handler(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const requestId = requestIdFromHeaders(request.headers);
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () =>
      createApiContextFromRequest(request, {
        requestId,
        ipAddress: forwardedFor?.split(",")[0]?.trim(),
        userAgent: request.headers.get("user-agent") ?? undefined,
      }),
    // Every response, success or error, carries the request id.
    responseMeta: () => ({ headers: { [REQUEST_ID_HEADER]: requestId } }),
    // Procedure failures are logged by the procedure middleware; this catches
    // the rest (unknown path, context creation, malformed batch).
    onError: ({ error, path, type }) =>
      observeHttpError({ error, path, type, requestId }),
  });
}

export { handler as GET, handler as POST };
