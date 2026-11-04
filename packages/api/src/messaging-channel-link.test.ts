import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  send: vi.fn(),
  binding: vi.fn(),
  person: vi.fn(),
  insert: vi.fn(),
  challenge: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@duna/db", () => ({
  messagingChannelBindings: {
    endpoint: "endpoint",
    senderPhone: "sender",
    personId: "person",
    revokedAt: "revoked",
  },
  messagingChannelChallenges: {
    codeHash: "hash",
    endpoint: "endpoint",
    consumedAt: "consumed",
    expiresAt: "expires",
    personId: "person",
  },
  people: { id: "id", status: "status" },
  getDatabase: () => ({
    query: {
      messagingChannelBindings: { findFirst: mocks.binding },
      people: { findFirst: mocks.person },
    },
    insert: () => ({ values: mocks.insert }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }),
  getTransactionalDatabase: () => ({
    transaction: (callback: (transaction: unknown) => unknown) =>
      callback({
        update: () => ({
          set: () => ({ where: () => ({ returning: mocks.challenge }) }),
        }),
        insert: () => ({
          values: () => ({ onConflictDoUpdate: mocks.upsert }),
        }),
      }),
  }),
}));
vi.mock("./messaging-service", () => ({
  loadConversation: mocks.load,
  sendConversationMessage: mocks.send,
  MessagingError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
import {
  beginMessagingChannelLink,
  channelLinkCodeHash,
  consumeMessagingChannelLink,
  parseChannelLinkCode,
  processVerifiedChannelInbound,
} from "./messaging-channel-link";
import { MessagingError } from "./messaging-service";
import type { ApiActor } from "./context";
const actor: ApiActor = {
  personId: "parent",
  displayName: "Parent",
  roles: ["guardian"],
  scopes: [],
  ageBand: "adult",
  isDemo: false,
};
const inbound = {
  senderPhone: "+15551112222",
  endpoint: "+15553334444",
  content: "Hello",
  clientMessageId: "event-id",
  optedOut: false,
  group: false,
  media: false,
};
beforeEach(() => {
  vi.stubEnv("SENDBLUE_PHONE_NUMBERS", inbound.endpoint);
  vi.stubEnv("SENDBLUE_WEBHOOK_SECRET", "s".repeat(32));
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.load.mockResolvedValue({
    conversation: {
      participants: [{ type: "organization", id: "club", displayName: "Club" }],
      context: { organizationId: "club" },
    },
    permissions: { canPost: true },
  });
  mocks.binding.mockResolvedValue({
    personId: "parent",
    organizationId: "club",
    conversationId: "thread",
  });
  mocks.person.mockResolvedValue({
    id: "parent",
    displayName: "Parent",
    status: "active",
    isMinor: false,
  });
});
describe("one-use phone channel linking", () => {
  it("uses an exact high-entropy command and stable non-plaintext digest", () => {
    expect(parseChannelLinkCode("DUNA " + "a".repeat(24))).toBe("A".repeat(24));
    expect(parseChannelLinkCode("DUNA 123456")).toBeUndefined();
    expect(channelLinkCodeHash("A".repeat(24))).toHaveLength(64);
  });
  it("requires an adult and an authorized writable club conversation", async () => {
    await expect(
      beginMessagingChannelLink({ ...actor, ageBand: "teen" }, "thread"),
    ).rejects.toThrow("adult");
    mocks.load.mockRejectedValue(new MessagingError("FORBIDDEN", "revoked"));
    await expect(beginMessagingChannelLink(actor, "thread")).rejects.toThrow(
      "revoked",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("stores only a hash and expires the authenticated challenge after ten minutes", async () => {
    const now = new Date("2026-11-04T12:00:00Z");
    const result = await beginMessagingChannelLink(actor, "thread", now);
    expect(result.command).toMatch(/^DUNA [A-F0-9]{24}$/);
    expect(result.expiresAt).toBe("2026-11-04T12:10:00.000Z");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "parent",
        organizationId: "club",
        conversationId: "thread",
        codeHash: channelLinkCodeHash(result.command.slice(5)),
      }),
    );
  });
  it("consumes valid challenges once and rejects expired or replayed challenges", async () => {
    mocks.challenge
      .mockResolvedValueOnce([
        {
          personId: "parent",
          organizationId: "club",
          conversationId: "thread",
        },
      ])
      .mockResolvedValueOnce([]);
    const command = "DUNA " + "a".repeat(24);
    expect(
      await consumeMessagingChannelLink(
        command,
        inbound.senderPhone,
        inbound.endpoint,
      ),
    ).toBe(true);
    expect(
      await consumeMessagingChannelLink(
        command,
        inbound.senderPhone,
        inbound.endpoint,
      ),
    ).toBe(false);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("revalidates current conversation access before using canonical message delivery", async () => {
    expect(await processVerifiedChannelInbound(inbound)).toBe("delivered");
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          clientMessageId: "event-id",
          conversationId: "thread",
          body: "Hello",
        }),
      }),
    );
    mocks.send.mockClear();
    mocks.load.mockRejectedValue(
      new MessagingError("FORBIDDEN", "Guardian revoked"),
    );
    expect(await processVerifiedChannelInbound(inbound)).toBe("access-review");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("never sends unlinked, minor, group or media content into a club", async () => {
    mocks.binding.mockResolvedValueOnce(undefined);
    expect(await processVerifiedChannelInbound(inbound)).toBe(
      "identity-required",
    );
    mocks.person.mockResolvedValueOnce({ id: "parent", isMinor: true });
    expect(await processVerifiedChannelInbound(inbound)).toBe(
      "identity-required",
    );
    expect(
      await processVerifiedChannelInbound({ ...inbound, group: true }),
    ).toBe("group-review");
    expect(
      await processVerifiedChannelInbound({ ...inbound, media: true }),
    ).toBe("media-review");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
