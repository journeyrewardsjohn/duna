import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: true,
  returning: vi.fn(),
  values: vi.fn(),
  rows: vi.fn(),
  process: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@duna/db", () => ({
  isDatabaseConfigured: () => mocks.configured,
  webhookEvents: { id: "id" },
  getDatabase: () => ({ insert: () => ({ values: mocks.values }) }),
  getTransactionalDatabase: () => ({
    transaction: (callback: (transaction: unknown) => unknown) =>
      callback({
        select: () => ({
          from: () => ({ where: () => ({ for: mocks.rows }) }),
        }),
        update: () => ({
          set: (value: unknown) => {
            mocks.update(value);
            return { where: async () => undefined };
          },
        }),
      }),
  }),
}));
vi.mock("./messaging-channel-link", () => ({
  parseChannelLinkCode: (value: string) =>
    value.startsWith("DUNA ") ? value : undefined,
  processVerifiedChannelInbound: mocks.process,
}));
import {
  authenticateSendblueWebhook,
  classifySendblueInbound,
  receiveSendblueInbound,
} from "./sendblue-ingress";
const payload = {
  message_handle: "message-one",
  is_outbound: false,
  status: "RECEIVED",
  from_number: "+15551112222",
  to_number: "+15553334444",
  content: "Move her lesson",
};
beforeEach(() => {
  mocks.configured = true;
  mocks.process.mockReset().mockResolvedValue("identity-required");
  mocks.rows
    .mockReset()
    .mockResolvedValue([{ id: "event-1", processedAt: null, payload: {} }]);
  mocks.update.mockReset();
  mocks.returning.mockReset();
  mocks.values.mockReset().mockReturnValue({
    onConflictDoNothing: () => ({ returning: mocks.returning }),
  });
});
describe("Sendblue ingress", () => {
  it("requires the configured strong secret", () => {
    const secret = "s".repeat(32);
    expect(authenticateSendblueWebhook(secret, secret)).toBe(true);
    expect(authenticateSendblueWebhook("bad", secret)).toBe(false);
    expect(authenticateSendblueWebhook(null, secret)).toBe(false);
    expect(authenticateSendblueWebhook("short", "short")).toBe(false);
  });
  it("rejects wrong endpoints and outbound callbacks", () => {
    expect(() => classifySendblueInbound(payload, [])).toThrow();
    expect(() =>
      classifySendblueInbound({ ...payload, sendblue_number: "+15556667777" }, [
        payload.to_number,
      ]),
    ).toThrow();
    expect(() =>
      classifySendblueInbound({ ...payload, is_outbound: true }, [
        payload.to_number,
      ]),
    ).toThrow();
  });
  it("does not treat phone possession as identity or club selection", () => {
    expect(
      classifySendblueInbound(payload, [payload.to_number]).disposition,
    ).toBe("identity-required");
  });
  it("preserves group ingress for review and classifies opt-outs first", () => {
    expect(
      classifySendblueInbound({ ...payload, group_id: "group-1" }, [
        payload.to_number,
      ]).disposition,
    ).toBe("group-review");
    expect(
      classifySendblueInbound(
        { ...payload, content: "STOP", group_id: "group-1" },
        [payload.to_number],
      ).disposition,
    ).toBe("opted-out");
  });
  it("uses a locked durable receipt and reuses the same message id on retries", async () => {
    mocks.returning
      .mockResolvedValueOnce([{ id: "event-1" }])
      .mockResolvedValueOnce([]);
    expect(
      await receiveSendblueInbound(payload, [payload.to_number]),
    ).toMatchObject({ duplicate: false });
    expect(
      await receiveSendblueInbound(payload, [payload.to_number]),
    ).toMatchObject({ duplicate: true });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "sendblue",
        providerEventId: `${payload.to_number}:message-one`,
        status: "received",
        signatureVerified: true,
      }),
    );
  });
  it("does not process an already completed receipt again", async () => {
    mocks.returning.mockResolvedValue([]);
    mocks.rows.mockResolvedValue([
      {
        id: "event-1",
        processedAt: new Date(),
        payload: { routingDisposition: "delivered" },
      },
    ]);
    expect(await receiveSendblueInbound(payload, [payload.to_number])).toEqual({
      duplicate: true,
      disposition: "delivered",
    });
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("redacts linking secrets in stored receipts", async () => {
    mocks.returning.mockResolvedValue([{ id: "event-1" }]);
    await receiveSendblueInbound({ ...payload, content: "DUNA SECRET" }, [
      payload.to_number,
    ]);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ content: "[Channel linking code]" }),
      }),
    );
  });
  it("never acknowledges a missing database", async () => {
    mocks.configured = false;
    await expect(
      receiveSendblueInbound(payload, [payload.to_number]),
    ).rejects.toThrow("unavailable");
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
