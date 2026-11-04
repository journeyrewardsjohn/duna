import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  update: vi.fn(),
  row: vi.fn(),
  person: vi.fn(),
  load: vi.fn(),
  fetch: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@duna/db", () => ({
  messagingChannelBindings: {},
  messagingChannelOutbox: { id: "id", status: "status" },
  conversationMessages: {},
  organizationMemberships: {},
  people: {},
  getDatabase: () => ({
    update: () => ({
      set: (value: unknown) => {
        mocks.update(value);
        return {
          where: () => ({
            returning: mocks.claim,
            then: (done: (value: unknown) => unknown) =>
              Promise.resolve(undefined).then(done),
          }),
        };
      },
    }),
    select: () => ({ from: () => ({ where: mocks.select }) }),
    query: {
      messagingChannelOutbox: { findFirst: mocks.row },
      people: { findFirst: mocks.person },
      conversationMessages: {
        findFirst: async () => ({
          body: "Hello",
          kind: "text",
          status: "published",
        }),
      },
    },
  }),
}));
vi.mock("./messaging-service", () => ({
  loadConversation: mocks.load,
  MessagingError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("./messaging-channel-link", () => ({
  channelEndpoints: () => ["+15550001111"],
}));
import {
  applyPhoneDeliveryStatus,
  dispatchPhoneReply,
  phoneDeliveryState,
} from "./sendblue-outbox";
const job = {
  id: "job",
  actorPersonId: "staff",
  recipientPersonId: "adult",
  organizationId: "club",
  conversationId: "thread",
  bindingId: "binding",
  endpoint: "+15550001111",
  recipientPhone: "+15552223333",
  body: "Club: Hello",
  status: "dispatching",
  providerMessageHandle: null,
};
const callback = {
  is_outbound: true as const,
  message_handle: "provider-1",
  from_number: job.endpoint,
  number: job.recipientPhone,
  status: "DELIVERED",
};
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.stubEnv("SENDBLUE_API_KEY", "key");
  vi.stubEnv("SENDBLUE_API_SECRET", "secret");
  vi.stubEnv("SENDBLUE_WEBHOOK_SECRET", "x".repeat(32));
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.claim.mockResolvedValue([job]);
  mocks.row.mockResolvedValue(job);
  mocks.person.mockResolvedValue({
    id: "adult",
    displayName: "Adult",
    isMinor: false,
  });
  mocks.select.mockResolvedValueOnce([{ role: "owner" }]).mockResolvedValue([
    {
      id: "binding",
      personId: "adult",
      senderPhone: job.recipientPhone,
      endpoint: job.endpoint,
    },
  ]);
  mocks.load.mockResolvedValue({
    permissions: { canPost: true },
    conversation: { safety: { minorPresent: false }, type: "dm" },
    participants: [
      { principal: { type: "user", id: "adult" } },
      { principal: { type: "organization", id: "club", displayName: "Club" } },
    ],
  });
});
describe("explicit phone reply outbox", () => {
  it("only classifies authoritative delivered/read statuses as delivered", () => {
    expect(phoneDeliveryState("QUEUED")).toBe("sent");
    expect(phoneDeliveryState("DELIVERED")).toBe("delivered");
    expect(phoneDeliveryState("surprise")).toBe("unknown");
  });
  it("dispatches a claimed job once to its frozen endpoint and recipient", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message_handle: "provider-1", status: "QUEUED" }),
    });
    expect(await dispatchPhoneReply("job")).toBe("sent");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body)).toMatchObject({
      number: job.recipientPhone,
      from_number: job.endpoint,
      content: job.body,
    });
    mocks.claim.mockResolvedValue([]);
    expect(await dispatchPhoneReply("job")).toBe("already-claimed");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry an unknown network outcome", async () => {
    mocks.fetch.mockRejectedValue(new Error("timeout"));
    expect(await dispatchPhoneReply("job")).toBe("unknown");
    expect(mocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "unknown" }),
    );
  });
  it("stops revoked or guardian-requiring conversations before provider delivery", async () => {
    mocks.load.mockResolvedValue({
      permissions: { canPost: true },
      conversation: { safety: { minorPresent: true }, type: "group" },
      participants: [],
    });
    expect(await dispatchPhoneReply("job")).toBe("failed");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects callbacks for a different recipient or provider handle", async () => {
    await expect(
      applyPhoneDeliveryStatus("job", { ...callback, number: "+15559999999" }),
    ).rejects.toThrow("frozen destination");
    mocks.row.mockResolvedValue({ ...job, providerMessageHandle: "original" });
    await expect(applyPhoneDeliveryStatus("job", callback)).rejects.toThrow(
      "frozen destination",
    );
  });
  it("never regresses delivered or failed status on late sent callbacks", async () => {
    mocks.row.mockResolvedValue({ ...job, status: "delivered" });
    await applyPhoneDeliveryStatus("job", { ...callback, status: "SENT" });
    mocks.row.mockResolvedValue({ ...job, status: "failed" });
    await applyPhoneDeliveryStatus("job", { ...callback, status: "SENT" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("reconciles an unknown outcome using a matching delivery receipt", async () => {
    mocks.row.mockResolvedValue({ ...job, status: "unknown" });
    await applyPhoneDeliveryStatus("job", callback);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "delivered",
        providerMessageHandle: "provider-1",
      }),
    );
  });
});
