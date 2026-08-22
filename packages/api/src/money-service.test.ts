import { describe, expect, it } from "vitest";
import { organizationMoneyWorkspaceSchema } from "./contracts";
import {
  buildStripeCaptureAmounts,
  calculateFundAvailability,
  loadDemoOrganizationMoneyWorkspace,
} from "./money-service";

describe("organization fund availability", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");

  it("holds refundable event money until the cancellation cutoff", () => {
    const result = calculateFundAvailability({
      policyMode: "refundable",
      refundBeforeMinutes: 24 * 60,
      eventStartsAt: new Date("2026-08-21T12:00:00.000Z"),
      orderCreatedAt: new Date("2026-08-17T12:00:00.000Z"),
      processorAvailableAt: new Date("2026-08-18T10:00:00.000Z"),
      now,
    });

    expect(result.status).toBe("held");
    expect(result.availableAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("releases non-refundable money only after the processor clears it", () => {
    const pending = calculateFundAvailability({
      policyMode: "non-refundable",
      orderCreatedAt: new Date("2026-08-17T12:00:00.000Z"),
      processorAvailableAt: new Date("2026-08-19T12:00:00.000Z"),
      now,
    });
    const available = calculateFundAvailability({
      policyMode: "non-refundable",
      orderCreatedAt: new Date("2026-08-17T12:00:00.000Z"),
      processorAvailableAt: new Date("2026-08-18T10:00:00.000Z"),
      now,
    });

    expect(pending.status).toBe("pending-clearance");
    expect(available.status).toBe("available");
  });

  it("keeps the demo workspace on the public Money contract", () => {
    const workspace = loadDemoOrganizationMoneyWorkspace(now);

    expect(() =>
      organizationMoneyWorkspaceSchema.parse(workspace),
    ).not.toThrow();
    expect(workspace.connect.earnings30d.netMinor).toBeGreaterThan(0);
    expect(workspace.connect.stripePendingMinor).toBeGreaterThan(0);
    expect(workspace.connect.stripePayoutInterval).toBe("manual");
    expect(
      workspace.refundPolicies.filter((policy) => policy.isDefault),
    ).toHaveLength(1);
  });

  it("builds an exact balanced Stripe capture from gross, fee, and net", () => {
    expect(
      buildStripeCaptureAmounts({
        grossMinor: 4_000,
        feeMinor: 355,
        netMinor: 3_645,
        taxMinor: 0,
      }),
    ).toEqual({
      grossMinor: 4_000,
      feeMinor: 355,
      netMinor: 3_645,
      taxMinor: 0,
      revenueMinor: 4_000,
    });
  });

  it("fails closed when Stripe gross cannot be reconciled", () => {
    expect(() =>
      buildStripeCaptureAmounts({
        grossMinor: 4_000,
        feeMinor: 355,
        netMinor: 3_644,
        taxMinor: 0,
      }),
    ).toThrow("gross does not equal fee plus net");
  });
});
