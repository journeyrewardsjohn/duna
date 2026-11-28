import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRequestId,
  isValidRequestId,
  requestIdFromHeaders,
  resolveEdgeRequestId,
} from "./ids";
import { log } from "./logger";
import { classifyProviderFailure, withProviderCall } from "./provider-call";
import { report, wasReported } from "./reporter";
import {
  configureObservability,
  registerTransport,
  resetObservability,
  setContextResolver,
  setLogSink,
} from "./runtime";
import { runWithLogContext } from "./server";
import type { ErrorReport } from "./types";

let lines: Array<Record<string, unknown>>;

beforeEach(() => {
  resetObservability();
  lines = [];
  configureObservability({
    surface: "web",
    environment: "test",
    release: "abc123",
    demo: true,
    level: "debug",
  });
  setLogSink((_level, line) => lines.push({ ...line }));
});

afterEach(() => resetObservability());

describe("log", () => {
  it("writes the base context, the request context and redacted fields", () => {
    setContextResolver(() => ({
      requestId: "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      actorId: "person-1",
      organizationId: "org-1",
    }));
    log.info("payments.checkout.created", {
      orderId: "order-1",
      email: "jane@example.com",
      note: "call me",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      event: "payments.checkout.created",
      surface: "web",
      environment: "test",
      release: "abc123",
      demo: true,
      requestId: "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      actorId: "person-1",
      organizationId: "org-1",
      orderId: "order-1",
      email: "[redacted]",
      note: "[redacted]",
    });
    expect(typeof lines[0]?.ts).toBe("string");
  });

  it("does not let fields spoof base keys", () => {
    log.warn("auth.session.refused", { surface: "hq", level: "debug" });
    expect(lines[0]).toMatchObject({ surface: "web", level: "warn" });
  });

  it("flags invalid event names instead of dropping the line", () => {
    log.error("Something broke!", { count: 1 });
    expect(lines[0]).toMatchObject({
      event: "log.event.invalid",
      invalidEvent: "Something_broke_",
      count: 1,
    });
  });

  it("respects the level threshold and child bindings", () => {
    configureObservability({ level: "warn" });
    log.info("api.procedure.succeeded");
    log.child({ provider: "stripe" }).warn("provider.call.rejected", {
      operation: "checkout.create",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      provider: "stripe",
      operation: "checkout.create",
    });
  });

  it("picks up AsyncLocalStorage context on the server", async () => {
    const { installServerObservability } = await import("./server");
    installServerObservability({ surface: "hq" });
    await runWithLogContext({ requestId: "req_aaaaaaaaaaaaaaaa" }, async () => {
      await Promise.resolve();
      log.info("api.procedure.succeeded", { path: "a.b" });
    });
    log.info("api.procedure.succeeded", { path: "outside" });
    expect(lines[0]).toMatchObject({
      requestId: "req_aaaaaaaaaaaaaaaa",
      surface: "hq",
    });
    expect(lines[1]?.requestId).toBeUndefined();
  });

  it("never throws, even when the sink throws", () => {
    setLogSink(() => {
      throw new Error("disk full");
    });
    expect(() => log.error("app.error.unexpected")).not.toThrow();
  });
});

describe("report", () => {
  it("logs once, forwards a redacted report to transports and returns the reference", () => {
    const received: ErrorReport[] = [];
    registerTransport({
      name: "memory",
      send: (built) => void received.push(built),
    });
    setContextResolver(() => ({
      requestId: "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      actorId: "p-1",
    }));
    const error = Object.assign(new Error("failed for jane@example.com"), {
      request: { headers: { cookie: "session=1" } },
    });
    const reference = report(error, {
      event: "api.procedure.failed",
      fields: { path: "player.profile.update", body: "secret text" },
      tags: { provider: "stripe" },
    });
    expect(reference).toBe("req_0a1b2c3d4e5f6a7b8c9d0e1f");
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      event: "api.procedure.failed",
      reference,
      level: "error",
      fields: { path: "player.profile.update", body: "[redacted]" },
      tags: { provider: "stripe" },
      context: { surface: "web", requestId: reference, actorId: "p-1" },
    });
    expect(JSON.stringify(received)).not.toContain("jane@example.com");
    expect(JSON.stringify(lines)).not.toContain("jane@example.com");
    expect(JSON.stringify(received)).not.toContain("session=1");
    expect(lines.filter((line) => line.level === "error")).toHaveLength(1);
    // Reporting the same error again is a no-op returning the same reference.
    expect(report(error)).toBe(reference);
    expect(received).toHaveLength(1);
    expect(wasReported(error)).toBe(true);
  });

  it("uses an explicit reference and survives a throwing transport", () => {
    registerTransport({
      name: "broken",
      send: () => {
        throw new Error("network");
      },
    });
    registerTransport({
      name: "async-broken",
      send: () => Promise.reject(new Error("x")),
    });
    expect(report(new Error("x"), { reference: "digest-123456" })).toBe(
      "digest-123456",
    );
  });

  it("creates an event reference when there is no request", () => {
    expect(report("plain string")).toMatch(/^err_[0-9a-f]{16}$/);
  });
});

describe("withProviderCall", () => {
  it("records success with duration and never the payload", async () => {
    const result = await withProviderCall(
      "stripe",
      "checkout.create",
      async () => ({
        id: "cs_1",
        customer_email: "jane@example.com",
      }),
    );
    expect(result.id).toBe("cs_1");
    expect(lines[0]).toMatchObject({
      event: "provider.call.succeeded",
      provider: "stripe",
      operation: "checkout.create",
    });
    expect(typeof lines[0]?.durationMs).toBe("number");
    expect(JSON.stringify(lines)).not.toContain("jane@example.com");
  });

  it("reports failures once and rethrows the same error", async () => {
    const received: ErrorReport[] = [];
    registerTransport({
      name: "memory",
      send: (built) => void received.push(built),
    });
    const failure = Object.assign(new Error("upstream 502"), {
      statusCode: 502,
    });
    await expect(
      withProviderCall("siteReader", "scrape", () => Promise.reject(failure)),
    ).rejects.toBe(failure);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      event: "provider.call.failed",
      tags: { provider: "siteReader", operation: "scrape" },
      fields: { httpStatus: 502 },
    });
    expect(wasReported(failure)).toBe(true);
  });

  it("logs provider rejections (4xx) without reporting", async () => {
    const received: ErrorReport[] = [];
    registerTransport({
      name: "memory",
      send: (built) => void received.push(built),
    });
    const declined = Object.assign(new Error("Your card was declined."), {
      type: "StripeCardError",
      statusCode: 402,
    });
    await expect(
      withProviderCall("stripe", "paymentIntent.create", () =>
        Promise.reject(declined),
      ),
    ).rejects.toBe(declined);
    expect(received).toHaveLength(0);
    expect(lines[0]).toMatchObject({
      event: "provider.call.rejected",
      httpStatus: 402,
    });
  });

  it("treats bad credentials and rate limits as failures", () => {
    expect(classifyProviderFailure({ statusCode: 401 })).toBe("failed");
    expect(classifyProviderFailure({ status: 429 })).toBe("failed");
    expect(classifyProviderFailure({ status: 404 })).toBe("rejected");
    expect(classifyProviderFailure(new TypeError("fetch failed"))).toBe(
      "failed",
    );
  });
});

describe("request ids", () => {
  it("reuses the platform id at the edge and ignores a client-sent id", () => {
    const vercel = "iad1::iad1::8x7zw-1732752000000-f8e2d9c4b3a1";
    expect(
      resolveEdgeRequestId(
        new Headers({
          "x-vercel-id": vercel,
          "x-request-id": "client-chosen-id",
        }),
      ),
    ).toBe(vercel);
    expect(resolveEdgeRequestId(new Headers())).toMatch(/^req_[0-9a-f]{24}$/);
  });

  it("reads the forwarded id in handlers and rejects malformed ids", () => {
    expect(
      requestIdFromHeaders(new Headers({ "x-request-id": "req_0a1b2c3d4e5f" })),
    ).toBe("req_0a1b2c3d4e5f");
    expect(
      requestIdFromHeaders(new Headers({ "x-request-id": "<script>" })),
    ).toMatch(/^req_/);
    expect(isValidRequestId(createRequestId())).toBe(true);
    expect(isValidRequestId("a b")).toBe(false);
  });
});

describe("console fallback", () => {
  it("writes JSON lines in production format", () => {
    setLogSink(undefined);
    configureObservability({ format: "json" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log.error("app.error.unexpected", { count: 1 });
    const written = spy.mock.calls[0]?.[0];
    spy.mockRestore();
    expect(JSON.parse(String(written))).toMatchObject({
      event: "app.error.unexpected",
      count: 1,
    });
  });
});

describe("server console guard", () => {
  it("redacts what other code writes to the console and leaves Duna's lines alone", async () => {
    const { installConsoleGuard } = await import("./server");
    const written: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void written.push(args);
    try {
      installConsoleGuard();
      const error = Object.assign(
        new Error("Proof failure for jane@example.com"),
        {
          body: { guardianName: "Pat Doe" },
        },
      );
      console.error("⨯", error);
      console.error({ email: "jane@example.com", orderId: "o-1" });
      setLogSink(undefined);
      configureObservability({ format: "json" });
      log.error("app.error.unexpected", { orderId: "o-2" });
    } finally {
      resetObservability();
      console.error = original;
    }
    const text = JSON.stringify(written);
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("Pat Doe");
    expect(text).toContain("Proof failure for [redacted:email]");
    expect(text).toContain("o-1");
    expect(String(written.at(-1)?.[0])).toContain('"orderId":"o-2"');
  });
});
