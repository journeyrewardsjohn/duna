import { describe, expect, it } from "vitest";
import {
  platformFeeToWithhold,
  type ConnectAccountFacts,
} from "../../payments";
import {
  derivePayAccountStatus,
  payPublishGateFor,
  requirementLabel,
} from "./account";

const facts = (
  overrides: Partial<ConnectAccountFacts> = {},
): ConnectAccountFacts => ({
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  cardPaymentsActive: true,
  currentlyDue: [],
  pastDue: [],
  pendingVerification: [],
  ...overrides,
});

describe("Duna Pay account status (six states)", () => {
  it.each([
    [undefined, "not-started"],
    [
      facts({
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      }),
      "in-progress",
    ],
    [
      facts({
        chargesEnabled: false,
        payoutsEnabled: false,
        pendingVerification: ["individual.id_number"],
      }),
      "verifying",
    ],
    [facts({ currentlyDue: ["external_account"] }), "action-needed"],
    [facts({ pastDue: ["company.tax_id"] }), "restricted"],
    [facts({ disabledReason: "rejected.fraud" }), "restricted"],
    [facts(), "ready"],
  ] as const)("%o → %s", (input, status) => {
    expect(derivePayAccountStatus(input)).toBe(status);
  });

  it("labels requirements in plain words", () => {
    expect(requirementLabel("external_account")).toBe(
      "Add a bank account for payouts",
    );
    expect(requirementLabel("company.address.city")).toBe("Provide city");
  });
});

describe("publish gate (assertPaymentsReady)", () => {
  const account = {
    organizationId: "00000000-0000-4000-8000-000000000001",
    status: "ready" as const,
    chargesEnabled: true,
    payoutsEnabled: true,
    cardPaymentsActive: true,
    requirementsDue: [],
    bank: { status: "verified" as const, last4: "6789" },
    onboardingMethod: "hosted" as const,
    business: { legalName: "Beach Club LLC" },
    firstPayoutDelayWaived: false,
    startTranche: { optIn: false, bps: 0 },
  };
  it("is ready only when every step is done and the account is ready", () => {
    expect(payPublishGateFor(account, {}).ready).toBe(true);
    const gate = payPublishGateFor(
      { ...account, status: "action-needed", bank: { status: "missing" } },
      { resume: { kind: "event", id: "00000000-0000-4000-8000-000000000002" } },
    );
    expect(gate.ready).toBe(false);
    expect(gate.steps.map((step) => [step.key, step.state])).toEqual([
      ["business", "done"],
      ["verify", "to-do"],
      ["payouts", "to-do"],
    ]);
    expect(gate.resumeHref).toBe(
      "/events/00000000-0000-4000-8000-000000000002?publish=1",
    );
  });
});

describe("recurring platform fee (defect 3)", () => {
  it("never withholds a fee the charge already collected as an application fee", () => {
    // Native subscriptions set application_fee_percent AND carried the fee in
    // metadata; the renewal webhook then withheld it a second time.
    expect(
      platformFeeToWithhold({
        requestedMinor: 420,
        alreadyCollectedMinor: 420,
      }),
    ).toBe(0);
    expect(
      platformFeeToWithhold({ requestedMinor: 420, alreadyCollectedMinor: 0 }),
    ).toBe(420);
    expect(
      platformFeeToWithhold({
        requestedMinor: 420,
        alreadyCollectedMinor: 100,
      }),
    ).toBe(320);
    expect(
      platformFeeToWithhold({
        requestedMinor: 420,
        alreadyCollectedMinor: 999,
      }),
    ).toBe(0);
  });
});
