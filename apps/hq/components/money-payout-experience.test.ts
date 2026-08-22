import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  new URL("./money-workspace.tsx", import.meta.url),
  "utf8",
);
const receipt = readFileSync(
  new URL("../app/payments/payouts/[payoutId]/page.tsx", import.meta.url),
  "utf8",
);

describe("Money payout experience", () => {
  it("separates prior bank payouts from currently withdrawable funds", () => {
    expect(workspace).toContain("Already paid to bank · 30 days");
    expect(workspace).toContain(
      "Historical payouts—not available to withdraw again",
    );
    expect(workspace).toContain("Stripe’s live balance could not be verified");
  });

  it("shows real submission progress and links the Stripe-backed receipt", () => {
    expect(workspace).toContain('role="progressbar"');
    expect(workspace).toContain("Moving your funds securely.");
    expect(workspace).toContain("View receipt");
    expect(workspace).toContain('name="idempotencyKey"');
    expect(receipt).toContain("This receipt is backed by Stripe’s current");
    expect(receipt).toContain("Expected in the bank");
  });
});
