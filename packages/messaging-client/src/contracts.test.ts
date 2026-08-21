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

describe("conversation widgets", () => {
  it("supports a complete poll with coach-controlled privacy and timing", () => {
    expect(
      messageWidgetSchema.parse({
        kind: "poll",
        id: "poll-practice-time",
        title: "Choose Saturday's practice time",
        options: [
          { id: "morning", label: "9:00 AM" },
          { id: "afternoon", label: "2:00 PM" },
        ],
        allowMultipleAnswers: true,
        hideVoterNames: true,
        endsAt: "2026-08-22T18:00:00.000Z",
      }),
    ).toMatchObject({
      kind: "poll",
      allowMultipleAnswers: true,
      hideVoterNames: true,
    });
  });

  it("limits a poll to ten non-empty options", () => {
    expect(
      messageWidgetSchema.safeParse({
        kind: "poll",
        id: "too-many",
        title: "Pick one",
        options: Array.from({ length: 11 }, (_, index) => ({
          id: `option-${index}`,
          label: `Option ${index}`,
        })),
        allowMultipleAnswers: false,
        hideVoterNames: false,
      }).success,
    ).toBe(false);
  });

  it("supports practice, session, and video cards in the conversation", () => {
    for (const resourceType of ["practice-plan", "session", "video"] as const) {
      expect(
        messageWidgetSchema.safeParse({
          kind: "resource-card",
          resourceType,
          resourceId: `${resourceType}-1`,
          title: "Saturday prep",
          detail: "Open the shared resource.",
          action: { label: "Open", href: "/app/messages" },
        }).success,
      ).toBe(true);
    }
  });
});
