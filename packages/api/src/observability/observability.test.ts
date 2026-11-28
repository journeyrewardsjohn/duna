import {
  ProviderNotConfiguredError,
  configureObservability,
  registerTransport,
  resetObservability,
  setLogSink,
  type ErrorReport,
} from "@duna/observability";
import { installServerObservability } from "@duna/observability/server";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../auth";
import { createApiContext, createDemoActor } from "../context";
import { receiveClientErrors } from "./client-errors";
import { observeHttpError, withProviderCall } from "./index";
import { SAFE_ERROR_MESSAGE } from "./trpc";

const requestId = "req_0a1b2c3d4e5f6a7b8c9d0e1f";
let lines: Array<Record<string, unknown>>;
let reports: ErrorReport[];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  resetObservability();
  installServerObservability();
  configureObservability({
    surface: "web",
    environment: "test",
    level: "debug",
  });
  lines = [];
  reports = [];
  setLogSink((_level, line) => lines.push({ ...line }));
  registerTransport({
    name: "memory",
    send: (built) => void reports.push(built),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetObservability();
});

const testRouter = router({
  ok: publicProcedure
    .input(z.object({ email: z.string() }))
    .query(() => "fine"),
  missing: publicProcedure.query(() => {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  }),
  refused: protectedProcedure.query(() => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Health sharing is off",
      cause: Object.assign(new Error("refused"), {
        healthReason: "consent-missing",
      }),
    });
  }),
  broken: publicProcedure.query(() => {
    throw Object.assign(
      new Error('relation "people" does not exist for jane@example.com'),
      { request: { headers: { cookie: "wos-session=secret" } } },
    );
  }),
  notConfigured: publicProcedure.query(() => {
    throw new ProviderNotConfiguredError("siteReader");
  }),
  providerDown: publicProcedure.mutation(() =>
    withProviderCall("stripe", "checkout.sessions.create", () =>
      Promise.reject(
        Object.assign(new Error("Stripe is down"), { statusCode: 503 }),
      ),
    ),
  ),
});

function call(path: string, init?: RequestInit & { query?: string }) {
  const url = `https://duna.test/api/trpc/${path}${init?.query ?? ""}`;
  const request = new Request(url, init);
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: testRouter,
    createContext: () =>
      createApiContext({ actor: createDemoActor(), requestId }),
    onError: ({ error, path: errorPath, type }) =>
      observeHttpError({ error, path: errorPath, type, requestId }),
  });
}

async function errorBody(response: Response) {
  const body = (await response.json()) as {
    error: { message: string; data: Record<string, unknown> };
  };
  return body.error;
}

describe("tRPC observability", () => {
  it("logs a success line with path, type, code and duration, never the input", async () => {
    const response = await call("ok", {
      query: `?input=${encodeURIComponent(JSON.stringify({ email: "jane@example.com" }))}`,
    });
    expect(response.status).toBe(200);
    const line = lines.find(
      (entry) => entry.event === "api.procedure.succeeded",
    );
    expect(line).toMatchObject({
      path: "ok",
      type: "query",
      code: "OK",
      requestId,
      actorId: createDemoActor().personId,
      organizationId: createDemoActor().organizationId,
    });
    expect(typeof line?.durationMs).toBe("number");
    expect(JSON.stringify(lines)).not.toContain("jane@example.com");
  });

  it("logs expected failures at warn, keeps their message, adds requestId and does not report", async () => {
    const response = await call("missing");
    expect(response.status).toBe(404);
    const error = await errorBody(response);
    expect(error.message).toBe("Event not found");
    expect(error.data).toMatchObject({ code: "NOT_FOUND", requestId });
    expect(reports).toHaveLength(0);
    expect(
      lines.find((entry) => entry.event === "api.procedure.failed"),
    ).toMatchObject({
      level: "warn",
      code: "NOT_FOUND",
      classification: "not-found",
    });
  });

  it("keeps the health refusal reason in the payload and logs it as a reason code", async () => {
    const response = await call("refused");
    const error = await errorBody(response);
    expect(error.data).toMatchObject({
      code: "FORBIDDEN",
      healthReason: "consent-missing",
      requestId,
    });
    expect(
      lines.find((entry) => entry.event === "api.procedure.failed"),
    ).toMatchObject({
      classification: "refused",
      reason: "consent-missing",
    });
  });

  it("reports unexpected failures once, redacted, and gives the client a safe message with the reference", async () => {
    const response = await call("broken");
    expect(response.status).toBe(500);
    const error = await errorBody(response);
    expect(error.message).toBe(`${SAFE_ERROR_MESSAGE} Reference: ${requestId}`);
    expect(error.data).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      requestId,
    });
    expect(JSON.stringify(error)).not.toContain("relation");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      event: "api.procedure.failed",
      reference: requestId,
      tags: { path: "broken", classification: "unexpected" },
    });
    const serialized = JSON.stringify({ reports, lines });
    expect(serialized).not.toContain("jane@example.com");
    expect(serialized).not.toContain("wos-session");
  });

  it("answers PRECONDITION_FAILED for a provider that is not configured, without reporting", async () => {
    const response = await call("notConfigured");
    const error = await errorBody(response);
    expect(error.data).toMatchObject({
      code: "PRECONDITION_FAILED",
      requestId,
    });
    expect(error.message).toBe("This feature is not configured yet.");
    expect(reports).toHaveLength(0);
    expect(
      lines.find((entry) => entry.event === "api.procedure.failed"),
    ).toMatchObject({
      classification: "provider-not-configured",
    });
  });

  it("does not double-report a provider failure that surfaces through a procedure", async () => {
    const response = await call("providerDown", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(500);
    expect(reports.map((item) => item.event)).toEqual(["provider.call.failed"]);
    expect(reports[0]?.tags).toMatchObject({
      provider: "stripe",
      operation: "checkout.sessions.create",
    });
    expect(
      lines.filter((entry) => entry.event === "api.procedure.failed"),
    ).toHaveLength(1);
  });

  it("logs failures outside any procedure (unknown path)", async () => {
    const response = await call("nope");
    expect(response.status).toBe(404);
    expect(
      lines.find((entry) => entry.event === "api.request.failed"),
    ).toMatchObject({
      code: "NOT_FOUND",
      requestId,
    });
  });
});

describe("client error endpoint", () => {
  const validEvent = {
    event: "client.crash.fatal",
    level: "fatal",
    reference: "err_0123456789abcdef",
    surface: "player",
    release: "1.4.0",
    error: {
      name: "TypeError",
      message: "undefined is not an object (jane@example.com)",
      stack: "TypeError: x\n    at Home (home.tsx:10:2)",
    },
    fields: { screen: "home", email: "jane@example.com" },
  };

  function post(body: unknown, headers: Record<string, string> = {}) {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Request("https://duna.test/api/observability/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: text,
    });
  }

  it("requires a signed-in person", async () => {
    const response = await receiveClientErrors(
      post({ events: [validEvent] }),
      createApiContext({ requestId, useDemoActor: false }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("accepts, re-redacts, logs and reports with the client's reference", async () => {
    const response = await receiveClientErrors(
      post({ events: [validEvent] }),
      createApiContext({ actor: createDemoActor(), requestId }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1, requestId });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      event: "client.crash.fatal",
      level: "fatal",
      reference: "err_0123456789abcdef",
      tags: { clientSurface: "player", origin: "client" },
      fields: { screen: "home", email: "[redacted]", requestId },
    });
    expect(JSON.stringify({ reports, lines })).not.toContain(
      "jane@example.com",
    );
  });

  it("rejects bodies over the limit, unknown fields and malformed JSON", async () => {
    const ctx = createApiContext({ actor: createDemoActor(), requestId });
    expect(
      (await receiveClientErrors(post("x".repeat(20_000)), ctx)).status,
    ).toBe(413);
    expect(
      (
        await receiveClientErrors(
          post({ events: [{ ...validEvent, cookie: "x" }] }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect((await receiveClientErrors(post("{nope"), ctx)).status).toBe(400);
    expect(
      (
        await receiveClientErrors(
          post({ events: Array.from({ length: 6 }, () => validEvent) }),
          ctx,
        )
      ).status,
    ).toBe(400);
  });

  it("rate limits per person", async () => {
    const actor = { ...createDemoActor(), personId: "rate-limit-person" };
    const ctx = createApiContext({ actor, requestId });
    const statuses: number[] = [];
    for (let index = 0; index < 32; index += 1) {
      statuses.push(
        (await receiveClientErrors(post({ events: [validEvent] }), ctx)).status,
      );
    }
    expect(statuses.slice(0, 30).every((status) => status === 202)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("Sentry provider readiness", () => {
  it("reports not-configured with the missing variable names until a DSN is set", async () => {
    const { createCaller } = await import("../router");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("SENTRY_DSN", "");
    const caller = createCaller(
      createApiContext({
        actor: createDemoActor(["player", "super-admin"]),
        requestId,
      }),
    );
    const readiness = await caller.admin.readiness.providers();
    expect(
      readiness.providers.find((provider) => provider.key === "sentry"),
    ).toMatchObject({
      status: "not-configured",
      missing: ["NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN"],
    });
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "http://public@127.0.0.1:9/1");
    const configured = await caller.admin.readiness.providers();
    expect(
      configured.providers.find((provider) => provider.key === "sentry")
        ?.status,
    ).toBe("configured");
  });
});
