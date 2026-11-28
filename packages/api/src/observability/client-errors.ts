/**
 * `POST /api/observability/client-errors`: error events from Duna's own
 * clients (Player and Pro today, the browser on web and HQ). Authenticated,
 * size-limited, rate limited per person, validated, re-redacted on arrival
 * (a client is never trusted to have redacted), then logged and reported to
 * the server transports with the client's reference.
 */
import {
  CLIENT_ERROR_BODY_MAX_BYTES,
  CLIENT_ERROR_MAX_EVENTS,
  EVENT_NAME_PATTERN,
  log,
  redactFields,
  report,
  scrubString,
  serializeError,
} from "@duna/observability";
import { z } from "zod";
import type { ApiContext } from "../context";
import { consumeRateLimit } from "../rate-limit";

const scalar = z.union([
  z.string().max(256),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const clientErrorEventSchema = z
  .object({
    event: z.string().max(80).regex(EVENT_NAME_PATTERN),
    level: z.enum(["warning", "error", "fatal"]),
    reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{5,127}$/),
    surface: z.enum(["web", "hq", "player", "pro"]),
    release: z.string().max(64).optional(),
    environment: z.string().max(32).optional(),
    occurredAt: z.string().max(40).optional(),
    error: z
      .object({
        name: z.string().max(80),
        message: z.string().max(1_000),
        stack: z.string().max(4_000).optional(),
      })
      .strict(),
    fields: z
      .record(z.string().max(64), scalar)
      .refine((value) => Object.keys(value).length <= 20)
      .optional(),
  })
  .strict();

export const clientErrorBatchSchema = z
  .object({
    events: z.array(clientErrorEventSchema).min(1).max(CLIENT_ERROR_MAX_EVENTS),
  })
  .strict();

export const CLIENT_ERROR_RATE_LIMIT = {
  capacity: 30,
  refillPerMinute: 30,
} as const;

function json(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}

async function readLimitedBody(request: Request): Promise<string | undefined> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > CLIENT_ERROR_BODY_MAX_BYTES) {
    return undefined;
  }
  const text = await request.text();
  return new TextEncoder().encode(text).length > CLIENT_ERROR_BODY_MAX_BYTES
    ? undefined
    : text;
}

export async function receiveClientErrors(
  request: Request,
  ctx: ApiContext,
): Promise<Response> {
  const requestId = ctx.requestId;
  if (!ctx.actor) {
    return json(401, { error: "Sign in required", requestId }, requestId);
  }
  const decision = await consumeRateLimit({
    key: `client-errors:${ctx.actor.personId}`,
    capacity: CLIENT_ERROR_RATE_LIMIT.capacity,
    refillPerMinute: CLIENT_ERROR_RATE_LIMIT.refillPerMinute,
    now: ctx.now,
  });
  if (!decision.allowed) {
    log.warn("client.error.rateLimited", {
      requestId,
      actorId: ctx.actor.personId,
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return json(429, { error: "Too many reports", requestId }, requestId);
  }
  const body = await readLimitedBody(request);
  if (body === undefined) {
    return json(413, { error: "Report too large", requestId }, requestId);
  }
  let parsed: z.infer<typeof clientErrorBatchSchema>;
  try {
    const result = clientErrorBatchSchema.safeParse(JSON.parse(body));
    if (!result.success) {
      log.warn("client.error.rejected", {
        requestId,
        issues: result.error.issues.length,
      });
      return json(400, { error: "Invalid report", requestId }, requestId);
    }
    parsed = result.data;
  } catch {
    return json(400, { error: "Invalid report", requestId }, requestId);
  }
  for (const event of parsed.events) {
    const error = new Error(scrubString(event.error.message));
    error.name = /^[A-Za-z0-9_$.]{1,80}$/.test(event.error.name)
      ? event.error.name
      : "ClientError";
    error.stack = event.error.stack
      ? scrubString(event.error.stack, 4_000)
      : undefined;
    const fields = {
      ...redactFields(event.fields),
      actorId: ctx.actor.personId,
      organizationId: ctx.actor.organizationId,
      requestId,
      clientRelease: event.release,
      clientEnvironment: event.environment,
      clientOccurredAt: event.occurredAt,
    };
    const tags = { clientSurface: event.surface, origin: "client" };
    if (event.surface === "web" || event.surface === "hq") {
      // The browser reports to Sentry itself when configured; here the event
      // only needs to reach Duna's log so its reference can be found.
      log.error(event.event, {
        ...fields,
        ...tags,
        level: event.level,
        reference: event.reference,
        error: serializeError(error),
      });
      continue;
    }
    report(error, {
      event: event.event,
      level: event.level,
      reference: event.reference,
      fields,
      tags,
    });
  }
  return json(202, { accepted: parsed.events.length, requestId }, requestId);
}
