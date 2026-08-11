import { describe, expect, it } from "vitest";
import { messagingPushCopy } from "./messaging-notifications";

describe("messaging push copy", () => {
  it("keeps payment context in the notification", () => {
    expect(
      messagingPushCopy({
        conversationTitle: "Summer league",
        senderName: "Duna Beach Club",
        kind: "payment-request",
        widgets: [
          {
            kind: "payment-request",
            title: "League balance",
            amountMinor: 4_500,
            currency: "USD",
            paymentPath: "/wallet/orders/order-1",
            status: "open",
          },
        ],
      }),
    ).toEqual({
      title: "Summer league",
      body: "Duna Beach Club requested $45.00 · League balance",
    });
  });

  it("identifies support responses consistently", () => {
    expect(
      messagingPushCopy({
        conversationTitle: "Help with my rental",
        senderName: "Duna Support",
        kind: "support-response",
        body: "Your rental is confirmed for Court 3.",
        widgets: [],
      }),
    ).toEqual({
      title: "Duna Support",
      body: "Your rental is confirmed for Court 3.",
    });
  });

  it("keeps private message previews compact", () => {
    const copy = messagingPushCopy({
      conversationTitle: "Saturday clinic",
      senderName: "Coach Rivera",
      kind: "text",
      body: `  ${"Update ".repeat(40)}  `,
      widgets: [],
    });
    expect(copy.body.length).toBeLessThanOrEqual(180);
    expect(copy.body.endsWith("…")).toBe(true);
  });
});
