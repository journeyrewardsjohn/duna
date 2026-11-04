import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ receive: vi.fn() }));
vi.mock("@duna/api/sendblue-ingress", async () => ({
  ...(await vi.importActual<typeof import("@duna/api/sendblue-ingress")>(
    "@duna/api/sendblue-ingress",
  )),
  receiveSendblueInbound: mocks.receive,
}));
import { POST } from "./route";
const secret = "test-only-webhook-secret-32-characters";
const payload = {
  message_handle: "fixture-message-1",
  is_outbound: false,
  status: "RECEIVED",
  from_number: "+15551112222",
  to_number: "+15553334444",
  content: "Test service message",
};
function request(body: unknown = payload, auth: string = secret) {
  return new Request("https://duna.coach/api/sendblue/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "sb-signing-secret": auth },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("SENDBLUE_WEBHOOK_SECRET", secret);
  vi.stubEnv("SENDBLUE_PHONE_NUMBERS", payload.to_number);
  mocks.receive
    .mockReset()
    .mockResolvedValue({ duplicate: false, disposition: "identity-required" });
});
afterEach(() => vi.unstubAllEnvs());
describe("authenticated Sendblue ingress route", () => {
  it("fails closed when the endpoint is not activated", async () => {
    vi.stubEnv("SENDBLUE_PHONE_NUMBERS", "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("rejects an invalid secret before processing", async () => {
    expect((await POST(request(payload, "wrong"))).status).toBe(401);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("rejects events for another provider number", async () => {
    expect(
      (await POST(request({ ...payload, to_number: "+15559999999" }))).status,
    ).toBe(400);
    expect(mocks.receive).not.toHaveBeenCalled();
  });
  it("passes authenticated valid ingress to the durable receipt handler", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      received: true,
      disposition: "identity-required",
    });
    expect(mocks.receive).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      [payload.to_number],
    );
  });
  it("acknowledges a durable duplicate without claiming new delivery", async () => {
    mocks.receive.mockResolvedValue({
      duplicate: true,
      disposition: "delivered",
    });
    expect(await (await POST(request())).json()).toMatchObject({
      received: true,
      duplicate: true,
    });
  });
  it("returns retryable failure when persistence fails and does not leak internals", async () => {
    mocks.receive.mockRejectedValue(new Error("private database URL"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database");
  });
});
