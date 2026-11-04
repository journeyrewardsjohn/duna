import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("@duna/api/sendblue-outbox", async () => ({
  ...(await vi.importActual<typeof import("@duna/api/sendblue-outbox")>(
    "@duna/api/sendblue-outbox",
  )),
  applyPhoneDeliveryStatus: mocks.apply,
}));
import { POST } from "./route";
const secret = "test-only-webhook-secret-32-characters";
const id = "10000000-0000-4000-8000-000000000001";
const payload = {
  is_outbound: true,
  message_handle: "provider-1",
  from_number: "+15553334444",
  number: "+15551112222",
  status: "DELIVERED",
};
function request(auth = secret, body: unknown = payload) {
  return new Request(`https://duna.coach/api/sendblue/status?id=${id}`, {
    method: "POST",
    headers: { "sb-signing-secret": auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("SENDBLUE_WEBHOOK_SECRET", secret);
  mocks.apply.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("phone delivery receipt route", () => {
  it("requires provider authentication", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("rejects an inbound payload as an outbound delivery receipt", async () => {
    expect(
      (await POST(request(secret, { ...payload, is_outbound: false }))).status,
    ).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("applies a signed outbound receipt to its exact outbox id", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(id, payload);
  });
});
