import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installBrowserErrorHandlers,
  installReactNativeErrorHandler,
} from "./global-handlers";
import {
  CLIENT_ERROR_EVENT_MAX_BYTES,
  createHttpTransport,
  toClientErrorEvent,
} from "./http-transport";
import { buildErrorReport } from "./reporter";
import {
  configureObservability,
  registerTransport,
  resetObservability,
  setLogSink,
} from "./runtime";
import {
  createSentryTransport,
  sampleRate,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
  sentryInitOptions,
} from "./sentry";
import type { ErrorReport } from "./types";

beforeEach(() => {
  resetObservability();
  configureObservability({
    surface: "player",
    environment: "test",
    release: "1.4.0",
  });
  setLogSink(() => undefined);
});
afterEach(() => resetObservability());

describe("http transport", () => {
  it("posts one redacted event with auth headers", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    const transport = createHttpTransport({
      endpoint: "https://duna.coach/api/observability/client-errors",
      surface: "player",
      headers: () => ({ authorization: "Bearer token-value" }),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await transport.send(
      buildErrorReport(new Error("crash for jane@example.com"), {
        event: "client.crash.fatal",
        reference: "err_0123456789abcdef",
        fields: { screen: "home", email: "jane@example.com" },
      }),
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://duna.coach/api/observability/client-errors");
    expect(init.headers).toMatchObject({
      authorization: "Bearer token-value",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body)) as { events: unknown[] };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      event: "client.crash.fatal",
      reference: "err_0123456789abcdef",
      surface: "player",
      release: "1.4.0",
      error: { name: "Error", message: "crash for [redacted:email]" },
      fields: { screen: "home", email: "[redacted]" },
    });
  });

  it("rate limits per minute and never throws when offline", async () => {
    let now = 0;
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    const transport = createHttpTransport({
      endpoint: "/api/observability/client-errors",
      surface: "pro",
      fetch: fetchMock as unknown as typeof fetch,
      maxPerMinute: 2,
      now: () => now,
    });
    const built = buildErrorReport(new Error("x"));
    await transport.send(built, undefined);
    await transport.send(built, undefined);
    await transport.send(built, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    now = 61_000;
    await transport.send(built, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shrinks oversized events to the byte limit", () => {
    const error = new Error("big");
    error.stack = `Error: big\n${"    at frame (file.ts:1:1)\n".repeat(400)}`;
    const report = buildErrorReport(error, {
      fields: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          `field${index}Id`,
          "x".repeat(200),
        ]),
      ),
    });
    const event = toClientErrorEvent(report, "player");
    expect(event).toBeDefined();
    expect(
      new TextEncoder().encode(JSON.stringify(event)).length,
    ).toBeLessThanOrEqual(CLIENT_ERROR_EVENT_MAX_BYTES);
  });
});

describe("global handlers", () => {
  it("reports browser errors and unhandled rejections", () => {
    const received: ErrorReport[] = [];
    registerTransport({
      name: "memory",
      send: (built) => void received.push(built),
    });
    const target = new EventTarget();
    const uninstall = installBrowserErrorHandlers(
      target as unknown as Parameters<typeof installBrowserErrorHandlers>[0],
    );
    const errorEvent = Object.assign(new Event("error"), {
      error: new Error("boom"),
    });
    target.dispatchEvent(errorEvent);
    const rejection = Object.assign(new Event("unhandledrejection"), {
      reason: new Error("nope"),
    });
    target.dispatchEvent(rejection);
    target.dispatchEvent(
      Object.assign(new Event("error"), { message: "Script error." }),
    );
    uninstall();
    target.dispatchEvent(
      Object.assign(new Event("error"), { error: new Error("after") }),
    );
    expect(received.map((item) => item.event)).toEqual([
      "client.error.unhandled",
      "client.promise.unhandled",
    ]);
  });

  it("chains React Native's previous global handler", () => {
    const received: ErrorReport[] = [];
    registerTransport({
      name: "memory",
      send: (built) => void received.push(built),
    });
    const previous = vi.fn();
    let handler = previous as (error: unknown, isFatal?: boolean) => void;
    const errorUtils = {
      getGlobalHandler: () => handler,
      setGlobalHandler: (next: typeof handler) => {
        handler = next;
      },
    };
    const uninstall = installReactNativeErrorHandler(errorUtils);
    const crash = new Error("render loop");
    handler(crash, true);
    expect(previous).toHaveBeenCalledWith(crash, true);
    expect(received[0]).toMatchObject({
      event: "client.crash.fatal",
      level: "fatal",
    });
    uninstall();
    expect(handler).toBe(previous);
  });
});

describe("sentry adapter", () => {
  it("sends a rebuilt, redacted error with the internal id as the only user field", () => {
    const captureException = vi.fn(() => "event-id");
    const transport = createSentryTransport({ captureException });
    const original = Object.assign(
      new Error("charge failed for jane@example.com"),
      {
        request: { headers: { cookie: "x" } },
      },
    );
    const built: ErrorReport = {
      ...buildErrorReport(original, { tags: { provider: "stripe" } }),
      context: {
        surface: "web",
        actorId: "person-1",
        requestId: "req_0a1b2c3d4e5f",
      },
    };
    transport.send(built, original);
    const [sent, context] = captureException.mock.calls[0] as unknown as [
      Error,
      Record<string, unknown>,
    ];
    expect(sent).not.toBe(original);
    expect(sent.message).toBe("charge failed for [redacted:email]");
    expect(
      (sent as unknown as Record<string, unknown>).request,
    ).toBeUndefined();
    expect(context).toMatchObject({
      level: "error",
      user: { id: "person-1" },
      tags: {
        provider: "stripe",
        requestId: "req_0a1b2c3d4e5f",
        surface: "web",
      },
    });
  });

  it("scrubs a full SDK event: request, user, exception, extra, breadcrumbs", () => {
    const event = scrubSentryEvent({
      user: {
        id: "person-1",
        email: "jane@example.com",
        ip_address: "203.0.113.9",
      },
      server_name: "lambda-host",
      request: {
        method: "POST",
        url: "https://duna.coach/players/jane-doe-a1b2?token=abc",
        cookies: { "wos-session": "secret" },
        data: { email: "jane@example.com", message: "hi" },
        query_string: "token=abc",
        headers: {
          authorization: "Bearer secret",
          cookie: "a=b",
          "content-type": "application/json",
          "user-agent": "Mozilla",
        },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "failed for +1 415 555 0134",
            stacktrace: {
              frames: [{ function: "f", vars: { password: "x" } }],
            },
          },
        ],
      },
      extra: { body: "free text", orderId: "o-1" },
      contexts: {
        browser: { name: "Chrome", version: "140" },
        custom: { email: "jane@example.com" },
      },
      tags: { url: "https://duna.coach/players/jane?x=1" },
      breadcrumbs: [
        { category: "console", message: "jane@example.com" },
        { category: "ui.click", message: "button[aria-label='Message Jane']" },
        {
          category: "fetch",
          data: {
            url: "/api/trpc/player.profile.get?input=%7B%7D",
            method: "GET",
            status_code: 200,
            request_body: "secret",
          },
        },
      ],
    });
    expect(event).toEqual({
      user: { id: "person-1" },
      request: {
        method: "POST",
        url: "https://duna.coach/players/:param",
        headers: { "content-type": "application/json" },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "failed for [redacted:phone]",
            stacktrace: { frames: [{ function: "f" }] },
          },
        ],
      },
      extra: { body: "[redacted]", orderId: "o-1" },
      contexts: {
        browser: { name: "Chrome", version: "140" },
        custom: { email: "[redacted]" },
      },
      tags: { url: "https://duna.coach/players/jane" },
      breadcrumbs: [
        {
          category: "fetch",
          data: {
            url: "/api/trpc/player.profile.get",
            method: "GET",
            status_code: 200,
          },
        },
      ],
    });
  });

  it("scrubs transaction names and streamed spans", () => {
    expect(
      scrubSentryEvent({ transaction: "GET /players/jane-doe-a1?tab=1" }),
    ).toEqual({ transaction: "GET /players/:param" });
    expect(
      scrubSentrySpan({
        name: "GET /api/trpc/player.profile.get?input=%7B%7D",
        attributes: {
          "http.url": "x",
          email: "jane@example.com",
          durationMs: 3,
        },
      }),
    ).toEqual({
      name: "GET /api/trpc/player.profile.get",
      attributes: { "http.url": "x", email: "[redacted]", durationMs: 3 },
    });
  });

  it("drops console and UI breadcrumbs", () => {
    expect(
      scrubSentryBreadcrumb({ category: "console", message: "x" }),
    ).toBeNull();
    expect(scrubSentryBreadcrumb({ category: "ui.input" })).toBeNull();
    expect(
      scrubSentryBreadcrumb({
        category: "navigation",
        data: { from: "/a?x=1", to: "/players/jo-b" },
      }),
    ).toEqual({
      category: "navigation",
      data: { from: "/a", to: "/players/:param" },
    });
  });

  it("builds init options that keep privacy settings and remove replay and global handlers", () => {
    const options = sentryInitOptions({
      dsn: "http://public@127.0.0.1:9/1",
      surface: "web",
      errorSampleRate: "0.5",
      tracesSampleRate: "nonsense",
    });
    expect(options).toMatchObject({
      sendDefaultPii: false,
      sampleRate: 0.5,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      includeLocalVariables: false,
    });
    const kept = options
      .integrations([
        { name: "Breadcrumbs" },
        { name: "GlobalHandlers" },
        { name: "Replay" },
        { name: "Console" },
        { name: "Dedupe" },
      ])
      .map((integration) => integration.name);
    expect(kept).toEqual(["Breadcrumbs", "Dedupe"]);
    expect(sampleRate("2", 1)).toBe(1);
    expect(sampleRate("-1", 1)).toBe(0);
    expect(sampleRate(undefined, 0)).toBe(0);
  });
});
