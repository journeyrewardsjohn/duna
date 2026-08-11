import { describe, expect, it } from "vitest";
import { messageWidgetSchema } from "./contracts";

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
