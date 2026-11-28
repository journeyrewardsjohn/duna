/**
 * The body of Next.js `onRequestError` (instrumentation.ts in Web and HQ):
 * server components, route handlers, server actions and the proxy.
 *
 * Next sends the browser only an opaque `digest` for a server error; the
 * error page shows it as the reference. This writes one line that ties the
 * digest to the request id, so "Reference: <digest>" finds the request.
 */
import {
  REQUEST_ID_HEADER,
  expectedKind,
  log,
  report,
  reportedReference,
  wasReported,
} from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { classifyApiError } from "./trpc";

export interface RequestErrorInput {
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface RequestErrorContextInput {
  readonly routePath: string;
  readonly routeType: string;
  readonly renderSource?: string;
}

function header(
  headers: RequestErrorInput["headers"],
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isExpected(error: unknown): boolean {
  if (error instanceof TRPCError) return classifyApiError(error).expected;
  return expectedKind(error) !== undefined;
}

export function reportRequestError(
  error: unknown,
  request: RequestErrorInput,
  context: RequestErrorContextInput,
): void {
  const digest =
    typeof (error as { digest?: unknown })?.digest === "string"
      ? (error as { digest: string }).digest
      : undefined;
  const requestId = header(request.headers, REQUEST_ID_HEADER);
  const fields = {
    requestId,
    digest,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  };
  const cause = (error as { cause?: unknown })?.cause;
  if (wasReported(error) || wasReported(cause)) {
    // Already reported (by the procedure middleware, for example): link the digest.
    log.error("next.request.failed", {
      ...fields,
      reference: reportedReference(error) ?? reportedReference(cause),
      reported: true,
    });
    return;
  }
  if (isExpected(error)) {
    log.warn("next.request.failed", { ...fields, classification: "expected" });
    return;
  }
  report(error, {
    event: "next.request.failed",
    reference: digest ?? requestId,
    fields,
    tags: { route: context.routePath, routeType: context.routeType },
  });
}
