import { afterEach, describe, expect, it, vi } from "vitest";
import { isSentConfigured, sendTemplateSms } from "./sent";

const originalKey = process.env.SENT_DM_API;
const originalFallbackKey = process.env.SENT_DM_API_KEY;
const originalSandbox = process.env.SENT_DM_SANDBOX;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.SENT_DM_API;
  else process.env.SENT_DM_API = originalKey;
  if (originalFallbackKey === undefined) delete process.env.SENT_DM_API_KEY;
  else process.env.SENT_DM_API_KEY = originalFallbackKey;
  if (originalSandbox === undefined) delete process.env.SENT_DM_SANDBOX;
  else process.env.SENT_DM_SANDBOX = originalSandbox;
});

describe("Sent.dm SMS adapter", () => {
  it("fails closed without a configured API key", async () => {
    delete process.env.SENT_DM_API;
    delete process.env.SENT_DM_API_KEY;

    expect(isSentConfigured()).toBe(false);
    await expect(
      sendTemplateSms({
        to: "+14155550123",
        templateName: "duna_player_invitation",
        parameters: { player_name: "Sam" },
        idempotencyKey: "invite-test",
      }),
    ).resolves.toMatchObject({ configured: false, sent: false });
  });

  it("uses the v3 template contract, E.164 recipients, and sandbox mode", async () => {
    process.env.SENT_DM_API = "sk_test_example";
    process.env.SENT_DM_SANDBOX = "true";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ message_id: "message-123" }],
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendTemplateSms({
        to: "+14155550123",
        templateName: "duna_player_invitation",
        parameters: {
          organization_name: "Duna Club",
          player_name: "Sam",
        },
        idempotencyKey: "invite-test",
      }),
    ).resolves.toEqual({
      configured: true,
      sent: true,
      messageId: "message-123",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sent.dm/v3/messages");
    expect(init.headers).toMatchObject({
      "x-api-key": "sk_test_example",
      "Idempotency-Key": "invite-test",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      to: ["+14155550123"],
      channel: ["sms"],
      template: {
        name: "duna_player_invitation",
        parameters: {
          organization_name: "Duna Club",
          player_name: "Sam",
        },
      },
      sandbox: true,
    });
  });
});
