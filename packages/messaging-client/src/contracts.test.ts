import { describe, expect, it } from "vitest";
import { messageWidgetSchema, sendMessageInputSchema } from "./contracts";

describe("rich message action paths", () => {
  it("accepts an internal Duna destination", () => {
    expect(
      messageWidgetSchema.safeParse({
        kind: "event-update",
        title: "Pools are posted",
        detail: "Review your first match.",
        action: { label: "Open event", href: "/events/golden-hour" },
      }).success,
    ).toBe(true);
  });

  it("rejects executable and protocol-relative destinations", () => {
    for (const href of ["javascript:alert(1)", "//example.com/phish"]) {
      expect(
        messageWidgetSchema.safeParse({
          kind: "event-update",
          title: "Update",
          detail: "Review this update.",
          action: { label: "Open", href },
        }).success,
      ).toBe(false);
    }
  });
});

describe("message attachment contracts", () => {
  const base = {
    conversationId: "10000000-0000-4000-8000-000000000001",
    clientMessageId: "20000000-0000-4000-8000-000000000001",
    kind: "text" as const,
    widgets: [],
  };

  it("allows an attachment-only message", () => {
    expect(
      sendMessageInputSchema.safeParse({
        ...base,
        attachmentUploadIds: ["30000000-0000-4000-8000-000000000001"],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty message and more than six attachments", () => {
    expect(sendMessageInputSchema.safeParse(base).success).toBe(false);
    expect(
      sendMessageInputSchema.safeParse({
        ...base,
        attachmentUploadIds: Array.from(
          { length: 7 },
          (_, index) => `30000000-0000-4000-8000-00000000000${index + 1}`,
        ),
      }).success,
    ).toBe(false);
  });
});
