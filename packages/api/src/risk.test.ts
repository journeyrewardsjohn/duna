import { describe, expect, it } from "vitest";
import { confirmAgentAction, proposeAgentAction } from "./risk";

describe("AI tool risk gate", () => {
  it("requires a fresh nonce for money, messaging, publishing, pricing, and ratings", () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const draft = proposeAgentAction({
      toolName: "payments.refund",
      toolInput: { orderId: "order-1", amountMinor: 4000 },
      proposedDiff: { status: "refunded" },
      actorPersonId: "person-1",
      now,
    });
    expect(() =>
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId: "person-1",
        now,
        confirmationNonce: "remembered-approval",
      }),
    ).toThrow("Fresh confirmation");
    expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId: "person-1",
        now,
        confirmationNonce: draft.confirmationNonce,
      }).status,
    ).toBe("confirmed");
  });

  it("does not create drafts for read tools", () => {
    expect(() =>
      proposeAgentAction({
        toolName: "events.search",
        toolInput: {},
        proposedDiff: {},
        actorPersonId: "person-1",
        now: new Date(),
      }),
    ).toThrow("Read tools");
  });
});
