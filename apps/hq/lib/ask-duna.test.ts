import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "eve/client";
import { askDunaTurnInput, validateAskDunaSessionBody } from "./ask-duna-input";
import { assertAskDunaOrigin, readAskDunaJson } from "./ask-duna-http";
import { signAskDunaToken, verifyAskDunaToken } from "./ask-duna-tokens";

beforeEach(() => {
  vi.stubEnv(
    "DUNA_AI_SESSION_SECRET",
    "test-only-secret-012345678901234567890123456789",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Ask Duna session credentials", () => {
  const claims = {
    sub: "10000000-0000-4000-8000-000000000001",
    organizationId: "20000000-0000-4000-8000-000000000001",
    conversationId: "30000000-0000-4000-8000-000000000001",
    sessionId: "session-one",
    purpose: "operate" as const,
  };
  it("binds identity, tenant, conversation, session and purpose in a short-lived signature", async () => {
    const token = await signAskDunaToken(claims);
    expect(await verifyAskDunaToken(token)).toEqual(claims);
    const parts = token.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ ...claims, purpose: "inspect" }),
    ).toString("base64url");
    await expect(verifyAskDunaToken(parts.join("."))).rejects.toThrow();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 121_000);
    await expect(verifyAskDunaToken(token)).rejects.toThrow();
  });
  it("rejects a missing signing secret", () => {
    vi.stubEnv("DUNA_AI_SESSION_SECRET", "");
    expect(() => signAskDunaToken(claims)).toThrow("Configure");
  });
});

describe("Ask Duna inbound content", () => {
  it("accepts the actual Eve client's prewarm and turn request formats", async () => {
    const requests: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = await readAskDunaJson(new Request(url, init));
      requests.push({ url, body });
      return Response.json({
        sessionId: "session-one",
        deliveryId: "delivery-one",
      });
    });
    const client = new Client({ host: "https://hq.example.test" });
    const { session } = await client.sessions.create();
    await session.send([{ type: "text", text: "Plan next week" }]);
    await session.respond([
      { requestId: "budget-request", optionId: "continue" },
    ]);
    expect(requests[0]!.body).toEqual({});
    expect(() => askDunaTurnInput.parse(requests[1]!.body)).not.toThrow();
    expect(() => askDunaTurnInput.parse(requests[2]!.body)).not.toThrow();
  });
  it("refuses remote files, executable uploads and client-controlled authority", () => {
    for (const data of [
      "https://example.test/private.pdf",
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
    ])
      expect(
        askDunaTurnInput.safeParse({
          message: [{ type: "file", data, mediaType: "application/pdf" }],
        }).success,
      ).toBe(false);
    expect(
      askDunaTurnInput.safeParse({
        message: "Hello",
        clientContext: { role: "super-admin" },
      }).success,
    ).toBe(false);
    expect(
      askDunaTurnInput.safeParse({ message: "Hello", stubs: {} }).success,
    ).toBe(false);
    expect(
      askDunaTurnInput.safeParse({
        message: [
          {
            type: "file",
            data: "data:text/html;base64,PHNjcmlwdD4=",
            mediaType: "text/html",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      askDunaTurnInput.safeParse({
        message: [
          {
            type: "file",
            data: "data:image/png;base64,aGVsbG8=",
            mediaType: "image/png",
          },
        ],
      }).success,
    ).toBe(true);
    expect(() =>
      validateAskDunaSessionBody({ turnId: "turn-1", auth: "fake" }, "cancel"),
    ).toThrow();
  });
  it("rejects CSRF, malformed JSON and oversized streamed bodies", async () => {
    expect(() =>
      assertAskDunaOrigin(
        new Request("https://hq.example.test/api/ask-duna", {
          method: "POST",
          headers: {
            origin: "https://attacker.test",
            "content-type": "application/json",
          },
          body: "{}",
        }),
      ),
    ).toThrow("Cross-origin");
    expect(() =>
      assertAskDunaOrigin(
        new Request("https://hq.example.test/api/ask-duna", {
          method: "POST",
          body: "{}",
        }),
      ),
    ).toThrow("JSON");
    await expect(
      readAskDunaJson(
        new Request("https://hq.example.test", { method: "POST", body: "{" }),
      ),
    ).rejects.toThrow("valid JSON");
    await expect(
      readAskDunaJson(
        new Request("https://hq.example.test", {
          method: "POST",
          body: JSON.stringify({ message: "x".repeat(100) }),
        }),
        50,
      ),
    ).rejects.toThrow("too large");
  });
});
