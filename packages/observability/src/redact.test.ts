import { describe, expect, it } from "vitest";
import {
  REDACTED,
  classifyKey,
  redact,
  redactFields,
  scrubString,
  scrubUrl,
  serializeError,
} from "./redact";

const uuid = "3f2a8d1c-5b6e-4c7d-9e8f-0a1b2c3d4e5f";

/** Every string anywhere in a value. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

const secrets = {
  email: "jane.doe+duna@example.co.uk",
  phoneIntl: "+44 7700 900123",
  phoneUs: "(415) 555-0134",
  card: "4242 4242 4242 4242",
  cardPlain: "4000056655665556",
  amex: "378282246310005",
  iban: "GB82WEST12345698765432",
  jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  // Key-shaped fixtures are assembled at runtime so secret scanners do not
  // mistake this file for leaked credentials. None of them is real.
  stripeLive: ["sk", "live", "51Hc9AbCdEfGhIjKlMnOpQrSt"].join("_"),
  stripeTest: ["sk", "test", "51Hc9AbCdEfGhIjKlMnOpQrSt"].join("_"),
  webhook: ["whsec", "9a8b7c6d5e4f3a2b1c0d"].join("_"),
  clientSecret: [
    "pi",
    "3NqLkJ2eZvKYlo2C0x1y2z3a",
    "secret",
    "AbCdEfGhIjKlMnOp",
  ].join("_"),
  openai: ["sk", "proj", "AbCdEfGhIjKlMnOpQrStUvWx"].join("-"),
  sentry: ["sntrys", "eyJpYXQiOjE3MzI3NTIwMDB9", "AbCdEfGh1234"].join("_"),
  randomKey: "Zx8Qp2Lm9Rt4Vw7Ys1Bn6Cd3Fg5Hj0Kk",
  hexSecret: "a".repeat(20) + "0123456789abcdef0123456789abcdef0123456789",
};

describe("classifyKey", () => {
  it("denies credentials, contact details, names, health, location and free text", () => {
    for (const key of [
      "authorization",
      "Authorization",
      "cookie",
      "set-cookie",
      "password",
      "newPassword",
      "accessToken",
      "refresh_token",
      "apiKey",
      "STRIPE_SECRET_KEY",
      "clientSecret",
      "signature",
      "cardNumber",
      "cvc",
      "iban",
      "accountNumber",
      "routingNumber",
      "email",
      "guardianEmail",
      "phone",
      "phoneNumber",
      "name",
      "firstName",
      "last_name",
      "displayName",
      "fullName",
      "address",
      "streetAddress",
      "postalCode",
      "dateOfBirth",
      "birthDate",
      "dob",
      "body",
      "message",
      "messageBody",
      "text",
      "notes",
      "description",
      "transcript",
      "prompt",
      "heartRate",
      "hrv",
      "healthMetrics",
      "sleepScore",
      "weight",
      "latitude",
      "lng",
      "location",
      "geolocation",
      "ipAddress",
      "userAgent",
      "input",
      "payload",
      "request",
      "headers",
      "user",
    ]) {
      expect(classifyKey(key), key).toBe("deny");
    }
  });

  it("allows ids, codes and measurements", () => {
    for (const key of [
      "requestId",
      "personId",
      "organizationId",
      "actorId",
      "orderIds",
      "stripeSessionId",
      "code",
      "path",
      "durationMs",
      "httpStatus",
      "provider",
      "operation",
      "retryAfterSeconds",
      "attempt",
    ]) {
      expect(classifyKey(key), key).toBe("safe");
    }
  });
});

describe("scrubString", () => {
  it.each(Object.entries(secrets))("removes %s from text", (_label, secret) => {
    const output = scrubString(`before ${secret} after`);
    expect(output).not.toContain(secret);
    expect(output.startsWith("before ")).toBe(true);
    expect(output.endsWith(" after")).toBe(true);
  });

  it("removes authorization schemes and URL credentials", () => {
    expect(scrubString("Authorization: Bearer abc.def-ghi_123456")).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
    expect(
      scrubString("postgres://duna:s3cr3t-pass@db.example.com:5432/duna"),
    ).toBe(`postgres://${REDACTED}@db.example.com:5432/duna`);
    expect(scrubString("Basic ZHVuYTpzZWNyZXQ=")).toBe(`Basic ${REDACTED}`);
    // Prose that merely contains the words stays readable.
    expect(scrubString("A digest property is included. Token expired")).toBe(
      "A digest property is included. Token expired",
    );
  });

  it("removes sensitive query parameters but keeps the rest", () => {
    expect(
      scrubString(
        "https://duna.coach/auth/callback?code=abc123&state=xyz&tab=2",
      ),
    ).toBe(
      `https://duna.coach/auth/callback?code=${REDACTED}&state=${REDACTED}&tab=2`,
    );
    expect(scrubString("/invite?email=jane%40example.com&token=t0k3n")).toBe(
      `/invite?email=${REDACTED}&token=${REDACTED}`,
    );
  });

  it("keeps ids, timestamps, versions, request ids and commit SHAs", () => {
    const keep = [
      uuid,
      "2026-11-27T10:15:00.000Z",
      "2026-11-27",
      "1732752000000",
      "iad1::iad1::8x7zw-1732752000000-f8e2d9c4b3a1",
      "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      "a0508f0c1e2d3c4b5a69788796a5b4c3d2e1f0a9",
      "cus_NffrFeUfNV2Hib",
      "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2w3X4y5Z6",
      "player.profile.get",
      "11.18.0",
      "HTTP 502",
      "amountMinor 12500",
      "+05:30",
    ];
    for (const value of keep) expect(scrubString(value), value).toBe(value);
  });

  it("does not flag non-Luhn 16-digit numbers as cards", () => {
    expect(scrubString("order 1234567812345678")).toBe(
      "order 1234567812345678",
    );
  });

  it("truncates long strings", () => {
    const output = scrubString("x".repeat(5_000), 100);
    expect(output.length).toBeLessThan(120);
    expect(output.endsWith("…[truncated]")).toBe(true);
  });
});

describe("redact", () => {
  it("redacts denied fields whatever their value, including nested objects", () => {
    const output = redact({
      requestId: "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      headers: { authorization: "Bearer x", cookie: "a=b" },
      person: { id: uuid, email: secrets.email },
      guardian: { phone: secrets.phoneIntl },
      health: { heartRate: 182, hrv: 41 },
      location: { latitude: 33.77, longitude: -118.19 },
      password: "hunter2",
    }) as Record<string, unknown>;
    expect(output).toEqual({
      requestId: "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      headers: REDACTED,
      person: REDACTED,
      guardian: REDACTED,
      health: REDACTED,
      location: REDACTED,
      password: REDACTED,
    });
  });

  it("scans unknown string fields and replaces free text", () => {
    const output = redact({
      reasonCode: "card_declined",
      contactLine: `Call me on ${secrets.phoneUs}`,
      stray: secrets.email,
      chatLine: "Hey coach, my son Sam twisted his ankle at practice today",
      nested: [{ deep: [{ deeper: { token: "abc", value: secrets.jwt } }] }],
    });
    const all = strings(output);
    for (const secret of [secrets.phoneUs, secrets.email, secrets.jwt, "Sam"]) {
      expect(all.join(" ")).not.toContain(secret);
    }
    expect(output).toMatchObject({
      reasonCode: "card_declined",
      chatLine: "[redacted:text]",
      nested: [{ deep: [{ deeper: { token: REDACTED } }] }],
    });
  });

  it("handles arrays, sets, maps, dates, bigint, functions and symbols", () => {
    const output = redact({
      ids: [uuid, uuid],
      tags: new Set(["a", secrets.email]),
      byId: new Map([[uuid, { email: secrets.email, count: 2 }]]),
      at: new Date("2026-11-27T00:00:00.000Z"),
      big: 10n,
      fn: () => "secret",
      sym: Symbol("x"),
      many: Array.from({ length: 50 }, (_, index) => index),
    }) as Record<string, unknown>;
    expect(output.ids).toEqual([uuid, uuid]);
    expect(output.tags).toEqual(["a", "[redacted:email]"]);
    expect(output.byId).toEqual({ [uuid]: { email: REDACTED, count: 2 } });
    expect(output.at).toBe("2026-11-27T00:00:00.000Z");
    expect(output.big).toBe("10");
    expect("fn" in output).toBe(false);
    expect("sym" in output).toBe(false);
    expect((output.many as unknown[]).length).toBe(21);
  });

  it("survives cycles and depth bombs", () => {
    const cyclic: Record<string, unknown> = { id: uuid };
    cyclic.self = cyclic;
    expect(redact(cyclic)).toEqual({ id: uuid, self: "[circular]" });
    let deep: Record<string, unknown> = { leaf: true };
    for (let index = 0; index < 20; index += 1) deep = { level: deep };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("drops Headers except safe names and never serialises Request objects", () => {
    const headers = new Headers({
      authorization: "Bearer secret",
      cookie: "wos-session=abc",
      "content-type": "application/json",
      "x-request-id": "req_0a1b2c3d4e5f6a7b8c9d0e1f",
    });
    expect(redact({ requestHeaders: headers })).toEqual({
      requestHeaders: {
        authorization: REDACTED,
        cookie: REDACTED,
        "content-type": "application/json",
        "x-request-id": "req_0a1b2c3d4e5f6a7b8c9d0e1f",
      },
    });
    const request = new Request("https://duna.coach/api/trpc?token=x", {
      headers: { authorization: "Bearer secret" },
    });
    expect(redact({ incoming: request })).toEqual({
      incoming: "[redacted:request]",
    });
  });

  it("never throws on hostile getters", () => {
    const hostile = {
      get explode() {
        throw new Error("boom");
      },
    };
    expect(() => redact(hostile)).not.toThrow();
  });

  it("redactFields always returns an object", () => {
    expect(redactFields(undefined)).toEqual({});
    expect(redactFields({ count: 1 })).toEqual({ count: 1 });
  });
});

describe("serializeError", () => {
  it("keeps name, scanned message, stack, code, status and cause; drops attached request data", () => {
    const cause = Object.assign(
      new Error(`lookup failed for ${secrets.email}`),
      {
        code: "ECONNRESET",
      },
    );
    const error = Object.assign(
      new Error(`Stripe rejected ${secrets.stripeLive} for ${secrets.email}`, {
        cause,
      }),
      {
        name: "StripeAuthenticationError",
        statusCode: 401,
        request: {
          headers: { authorization: `Bearer ${secrets.stripeLive}` },
          body: { email: secrets.email, card: secrets.card },
        },
        config: { data: secrets.jwt },
        response: { data: { phone: secrets.phoneIntl } },
        raw: { message: secrets.email },
      },
    );
    const output = serializeError(error);
    expect(output.name).toBe("StripeAuthenticationError");
    expect(output.status).toBe(401);
    expect(output.cause?.code).toBe("ECONNRESET");
    expect(Object.keys(output).sort()).toEqual(
      ["cause", "message", "name", "stack", "status"].sort(),
    );
    const all = JSON.stringify(output);
    for (const secret of [
      secrets.stripeLive,
      secrets.email,
      secrets.card,
      secrets.jwt,
      secrets.phoneIntl,
    ]) {
      expect(all).not.toContain(secret);
    }
  });

  it("serialises errors nested in objects through redact", () => {
    const output = redact({
      error: Object.assign(new Error("Payment failed"), {
        request: { cookie: "x" },
      }),
    }) as { error: Record<string, unknown> };
    expect(output.error.message).toBe("Payment failed");
    expect(output.error.request).toBeUndefined();
  });

  it("counts Zod-style issues instead of copying them", () => {
    const error = Object.assign(new Error("Invalid input"), {
      name: "ZodError",
      issues: [{ message: secrets.email }, { message: "x" }],
    });
    expect(serializeError(error)).toMatchObject({
      name: "ZodError",
      issues: 2,
    });
    expect(JSON.stringify(serializeError(error))).not.toContain(secrets.email);
  });

  it("removes bound query parameters from database errors", () => {
    const error = new Error(
      'Failed query: update "people" set "display_name" = $1 where "id" = $2\nparams: Jane Doe,3f2a8d1c-5b6e-4c7d-9e8f-0a1b2c3d4e5f',
    );
    error.stack = `Error: ${error.message}\n    at query (session.js:41:15)`;
    const output = serializeError(error);
    expect(output.message).toBe(
      `Failed query: update "people" set "display_name" = $1 where "id" = $2\nparams: ${REDACTED}`,
    );
    expect(output.stack).not.toContain("Jane Doe");
    expect(output.stack).toContain("at query (session.js:41:15)");
  });

  it("handles non-errors and aggregate errors", () => {
    expect(serializeError(`thrown ${secrets.email}`).message).toBe(
      "thrown [redacted:email]",
    );
    expect(serializeError({ email: secrets.email }).message).toBe(
      "Non-error value thrown (object)",
    );
    const aggregate = new AggregateError(
      [new Error("a"), new Error("b")],
      "many",
    );
    expect(
      serializeError(aggregate).errors?.map((inner) => inner.message),
    ).toEqual(["a", "b"]);
  });

  it("bounds the stack", () => {
    const error = new Error("deep");
    error.stack = [
      "Error: deep",
      ...Array.from({ length: 200 }, (_, i) => `    at f${i} (file.ts:${i}:1)`),
    ].join("\n");
    expect(serializeError(error).stack?.split("\n").length).toBeLessThanOrEqual(
      26,
    );
  });
});

describe("scrubUrl", () => {
  it("strips query strings and fragments", () => {
    expect(scrubUrl("https://duna.coach/app/settings?tab=billing#x")).toBe(
      "https://duna.coach/app/settings",
    );
    expect(
      scrubUrl("/api/trpc/player.profile.get?input=%7B%22email%22%7D"),
    ).toBe("/api/trpc/player.profile.get");
  });

  it("parameterises slugs and handles for third parties", () => {
    expect(
      scrubUrl("https://duna.coach/players/jane-doe-a1b2c3d4", {
        paramPaths: true,
      }),
    ).toBe("https://duna.coach/players/:param");
    expect(scrubUrl(`/events/${uuid}/register`, { paramPaths: true })).toBe(
      `/events/${uuid}/register`,
    );
  });
});
