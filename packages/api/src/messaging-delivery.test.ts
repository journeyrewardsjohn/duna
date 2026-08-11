import { describe, expect, it } from "vitest";
import {
  advanceDeliveryWatermark,
  decodeMessagingCursor,
  encodeMessagingCursor,
  loadDeliveryMessages,
} from "./messaging-delivery";

describe("owned messaging delivery cursors", () => {
  it("round-trips opaque keyset cursors", () => {
    const cursor = {
      t: "2026-08-11T10:15:30.000Z",
      k: "10000000-0000-4000-8000-000000000001",
    };
    expect(decodeMessagingCursor(encodeMessagingCursor(cursor))).toEqual(
      cursor,
    );
  });

  it("rejects malformed cursors before they reach Neon", () => {
    expect(() => decodeMessagingCursor("not-a-cursor")).toThrow(
      "Messaging cursor is invalid.",
    );
  });

  it("rejects malformed conversation ids before they reach Neon", async () => {
    await expect(
      advanceDeliveryWatermark({
        actor: {
          personId: "10000000-0000-4000-8000-000000000001",
          displayName: "Player",
          roles: ["player"],
          scopes: [],
          ageBand: "adult",
          isDemo: false,
        },
        conversationId: "not-a-conversation",
        kind: "read",
        seq: 1,
      }),
    ).rejects.toThrow("Conversation id is invalid.");
  });

  it("rejects malformed sequence cursors before they reach Neon", async () => {
    await expect(
      loadDeliveryMessages({
        actor: {
          personId: "10000000-0000-4000-8000-000000000001",
          displayName: "Player",
          roles: ["player"],
          scopes: [],
          ageBand: "adult",
          isDemo: false,
        },
        conversationId: "10000000-0000-4000-8000-000000000002",
        afterSequence: Number.NaN,
      }),
    ).rejects.toThrow("Message sequence cursor must be non-negative.");
  });
});
