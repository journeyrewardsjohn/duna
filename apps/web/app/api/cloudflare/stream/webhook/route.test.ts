import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCloudflareStreamWebhook } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare Stream live webhook authorization", () => {
  it("accepts Cloudflare's generic webhook secret header", () => {
    vi.stubEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET", "notification-secret");
    expect(
      isAuthorizedCloudflareStreamWebhook(
        new Request("https://duna.coach/api/cloudflare/stream/webhook", {
          headers: { "cf-webhook-auth": "notification-secret" },
        }),
      ),
    ).toBe(true);
  });

  it("fails closed for a missing or mismatched secret", () => {
    vi.stubEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET", "notification-secret");
    expect(
      isAuthorizedCloudflareStreamWebhook(
        new Request("https://duna.coach/api/cloudflare/stream/webhook", {
          headers: { "cf-webhook-auth": "wrong-secret" },
        }),
      ),
    ).toBe(false);
    expect(
      isAuthorizedCloudflareStreamWebhook(
        new Request("https://duna.coach/api/cloudflare/stream/webhook"),
      ),
    ).toBe(false);
  });
});
